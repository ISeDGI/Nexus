const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const usernameInput = document.getElementById('username');

let username = localStorage.getItem('chat_username') || 'User' + Math.floor(Math.random() * 1000);
if (usernameInput) {
    usernameInput.value = username;
    usernameInput.addEventListener('change', () => {
        username = usernameInput.value || 'Аноним';
        localStorage.setItem('chat_username', username);
    });
}

async function loadMessages() {
    try {
        const response = await fetch('/api/messages');
        const messages = await response.json();
        
        messagesDiv.innerHTML = messages.map(msg => 
            `<div class="message">
                <span class="msg-username">${msg.username}</span>
                <span class="msg-text">${msg.text}</span>
                <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>`
        ).join('');
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    
    try {
        await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, text })
        });
        msgInput.value = '';
        loadMessages();
    } catch (error) {
        console.error('Ошибка отправки:', error);
    }
}

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

loadMessages();
setInterval(loadMessages, 3000);