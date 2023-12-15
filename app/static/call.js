let localStream = null;
let remoteStream = null;
let peerConnection = null;
const configuration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]}; 

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

const serverUrl = 'ws://127.0.0.1:8000/ws';
let ws;

async function joinMeeting() {
    const meetingId = document.getElementById('call-id').value;
    const token = localStorage.getItem('accessToken'); 

    if (!meetingId) {
        alert("Please enter a Call ID.");
        return;
    }

    if (!token) {
        alert("You are not logged in.");
        return;
    }

    ws = new WebSocket(`${serverUrl}/${meetingId}?token=${token}`);

    ws.onopen = () => {
        console.log('Connected to the WebSocket server');
        initializePeerConnection();
    };

    ws.onmessage = async (message) => {
        const data = JSON.parse(message.data);

        if (data.type === 'user_list') {
            updateUserListUI(data.users);
        } else if (data.answer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            ws.send(JSON.stringify({'answer': answer}));
        } else if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

function updateUserListUI(users) {
    const userListDiv = document.getElementById('user-list');
    userListDiv.innerHTML = ''; 

    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.textContent = user; 
        userListDiv.appendChild(userElement);
    });
}

async function initializePeerConnection() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(configuration);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideo.srcObject = remoteStream;
            }
            remoteStream.addTrack(event.track);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({ 'candidate': event.candidate }));
            }
        };

    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access the camera or microphone. Please check permissions.');
    }
}

async function enableVideo() {
    try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream = videoStream;
        localVideo.srcObject = localStream;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        broadcastNewStream();
    } catch (error) {
        console.error('Error accessing video devices:', error);
        alert('Could not access the camera. Please check permissions.');
    }
}

function broadcastNewStream() {
    peerConnection.createOffer().then(offer => {
        return peerConnection.setLocalDescription(offer);
    }).then(() => {
        ws.send(JSON.stringify({'offer': peerConnection.localDescription}));
    });
}


async function startCall() {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({'offer': offer}));
}

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (ws) {
        ws.close();
        ws = null;
    }

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
}

function toggleMuteAudio() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        document.getElementById('mute-audio').textContent = audioTrack.enabled ? 'Mute' : 'Unmute';
    }
}

function toggleMuteVideo() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        document.getElementById('mute-video').textContent = videoTrack.enabled ? 'Disable Video' : 'Enable Video';
    }
}

document.getElementById('join-call').addEventListener('click', joinMeeting);
document.getElementById('start-call').addEventListener('click', startCall);
document.getElementById('enable-video').addEventListener('click', enableVideo);
document.getElementById('end-call').addEventListener('click', endCall);
document.getElementById('mute-audio').addEventListener('click', toggleMuteAudio);
document.getElementById('mute-video').addEventListener('click', toggleMuteVideo);
