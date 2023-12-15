let localStream = null;
let remoteStream = null;
let peerConnection = null;
const configuration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]}; 

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

const serverUrl = 'ws://192.168.0.103:8000/ws';
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

        if (data.answer) {
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

async function initializePeerConnection() {
    console.log('navigator.mediaDevices:', navigator.mediaDevices); // Debugging line

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Your browser does not support the mediaDevices API or getUserMedia.');
        console.error('mediaDevices API or getUserMedia is not supported in this browser.');
        return;
    }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

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
document.getElementById('end-call').addEventListener('click', endCall);
document.getElementById('mute-audio').addEventListener('click', toggleMuteAudio);
document.getElementById('mute-video').addEventListener('click', toggleMuteVideo);
