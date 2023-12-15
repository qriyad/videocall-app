let userInput = '';
let passInput = '';

document.addEventListener('DOMContentLoaded', () => {
    const username = document.getElementById('userLoginEmail');
    const password = document.getElementById('userLoginPassword');

    username.addEventListener("input", (event) => {
        userInput = event.target.value;
    });

    password.addEventListener("input", (event) => {
        passInput = event.target.value;
    });

    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', apiRequest);
});

async function apiRequest(event) {
    event.preventDefault();
    
    const formData = new URLSearchParams();
    formData.append('username', userInput);
    formData.append('password', passInput);

    const response = await fetch('http://192.168.0.103:8000/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
    });

    if (response.ok) {
        const data = await response.json();
        console.log(data);

        localStorage.setItem('accessToken', data.access_token);
        localStorage.setItem('tokenType', data.token_type);
        
        window.location.href = 'call.html';
    } else {
        console.error('Login failed:', response.status, response.statusText);
    }
}
