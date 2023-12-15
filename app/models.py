from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base


Base = declarative_base()

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, index=True) 
    email = Column(String(255), unique=True, index=True)     
    hashed_password = Column(String(255))                   
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Message(Base):
    __tablename__ = 'messages'

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    recipient_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    content = Column(String(1000), nullable=False)  
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sender = relationship('User', foreign_keys=[sender_id])
    recipient = relationship('User', foreign_keys=[recipient_id])

class Call(Base):
    __tablename__ = 'calls'

    id = Column(Integer, primary_key=True, index=True)
    initiator_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    participant_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True))

    initiator = relationship('User', foreign_keys=[initiator_id])
    participant = relationship('User', foreign_keys=[participant_id])