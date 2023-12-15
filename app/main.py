from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
import models
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List
from fastapi.middleware.cors import CORSMiddleware
from auth import get_password_hash, create_access_token, verify_password,verify_token

app = FastAPI()

origins = [ 
    "http://localhost",
    "http://localhost:3000",
    "http://192.168.0.103:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
engine = create_engine("mysql+pymysql://root:root@localhost:3306/chat_db")
Session = sessionmaker(bind=engine)

def recreate_database():
    #models.Base.metadata.drop_all(engine)
    models.Base.metadata.create_all(engine)

recreate_database()

class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str

class MessageCreate(BaseModel):
    recipient_id: int
    content: str

class MessageRead(BaseModel):
    sender_username: str
    content: str
    created_at: datetime

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)
    
def get_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    username = verify_token(token, credentials_exception)
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

@app.get("/")
def home():
    return {"message": "Hello World"}

@app.post("/user", response_model=UserResponse)
async def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_email_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_email_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    db_username_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_username_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    hashed_password = get_password_hash(user.password)
    db_user = models.User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, username: str, password: str):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        return False
    return user

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/protected-route")
async def protected_route(current_user: models.User = Depends(get_current_user)):
    return {"message": "Protected route", "user": current_user.username}


@app.post("/messages/")
async def create_message(message: MessageCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    recipient = db.query(models.User).filter(models.User.id == message.recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    new_message = models.Message(
        sender_id=current_user.id,
        recipient_id=message.recipient_id,
        content=message.content
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    return new_message


@app.get("/messages/", response_model=List[MessageRead])
async def read_messages(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    messages = db.query(models.Message, models.User.username).join(
        models.User, models.User.id == models.Message.sender_id
    ).filter(
        (models.Message.sender_id == current_user.id) | 
        (models.Message.recipient_id == current_user.id)
    ).all()

    return [MessageRead(sender_username=username, 
                        content=message.content, 
                        created_at=message.created_at) 
            for message, username in messages]

@app.post("/calls/start")
async def start_call(participant_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    new_call = models.Call(initiator_id=current_user.id, participant_id=participant_id)
    db.add(new_call)
    db.commit()
    db.refresh(new_call)
    return new_call

@app.post("/calls/end/{call_id}")
async def end_call(call_id: int, db: Session = Depends(get_db)):
    call = db.query(models.Call).filter(models.Call.id == call_id).first()
    if call:
        call.end_time = func.now()
        db.commit()
        return {"message": "Call ended"}
    else:
        raise HTTPException(status_code=404, detail="Call not found")
    
def check_meeting_exists(call_id: int, db: Session) -> bool:
    return db.query(models.Call).filter(models.Call.id == call_id).first() is not None

@app.websocket("/ws/{call_id}")
async def websocket_endpoint(websocket: WebSocket, call_id: int, token: str = Query(...), db: Session = Depends(get_db)):
    if not check_meeting_exists(call_id, db):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        print(f"Client disconnected from call {call_id}")