let currentChatId = null;
let currentChatType = null;
let currentChatName = '';
let currentChatUserId = null;

const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const privateChatsDiv = document.getElementById('private-chats');
const groupChatsDiv = document.getElementById('group-chats');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const currentChatNameSpan = document.getElementById('current-chat-name');
const usernameDisplay = document.getElementById('username-display');

const userId = window.userId || 0;

console.log('🚀 Приложение запущено, userId:', userId);

async function loadChats() {
    try {
        const resp = await fetch('/api/chats');
        if (!resp.ok) return;
        const data = await resp.json();
        
        privateChatsDiv.innerHTML = data.private.map(p => `
            <div class="chat-item" onclick="openChat('private', 'user_${p.id}', '${p.display_name || p.username}', ${p.id})">
                <span class="chat-name">${p.display_name || p.username}</span>
            </div>
        `).join('');
        
        groupChatsDiv.innerHTML = data.groups.map(g => `
            <div class="chat-item" onclick="openChat('group', 'group_${g.id}', '${g.name}')">
                <span class="chat-name">${g.name}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

function openChat(type, chatId, name, otherUserId = null) {
    currentChatId = chatId;
    currentChatType = type;
    currentChatName = name;
    currentChatUserId = otherUserId;
    currentChatNameSpan.textContent = name;
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    if (event && event.target) {
        const item = event.target.closest('.chat-item');
        if (item) item.classList.add('active');
    }
    
    loadMessages(chatId);
}

async function loadMessages(chatId) {
    try {
        const resp = await fetch(`/api/messages/${chatId}`);
        if (!resp.ok) {
            messagesDiv.innerHTML = `<div style="color:red;text-align:center;padding:20px;">Ошибка загрузки сообщений</div>`;
            return;
        }
        
        const messages = await resp.json();
        
        if (messages.length === 0) {
            messagesDiv.innerHTML = '<div style="color:#868e96;text-align:center;padding:20px;">Нет сообщений</div>';
            return;
        }
        
        messagesDiv.innerHTML = messages.map(msg => {
            const isOwn = msg.sender_id == userId;
            return `<div class="message ${isOwn ? 'own' : 'other'}">
                <span class="msg-username">${msg.display_name || msg.username}</span>
                <div class="msg-text">${escapeHtml(msg.text)}</div>
                <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>`;
        }).join('');
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendMessage() {
    if (!currentChatId) {
        alert('Выберите чат');
        return;
    }
    
    const text = msgInput.value.trim();
    if (!text) return;
    
    try {
        const resp = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: currentChatId,
                chat_type: currentChatType || 'private',
                text: text
            })
        });
        
        if (!resp.ok) {
            console.error('Ошибка отправки');
            return;
        }
        
        msgInput.value = '';
        loadMessages(currentChatId);
    } catch (error) {
        console.error('Ошибка отправки:', error);
    }
}

searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    
    if (query.length < 1) {
        searchResults.style.display = 'none';
        return;
    }
    
    try {
        const resp = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
        if (!resp.ok) return;
        const users = await resp.json();
        
        if (users.length === 0) {
            searchResults.innerHTML = '<div class="result-item">Ничего не найдено</div>';
        } else {
            searchResults.innerHTML = users.map(u => `
                <div class="result-item" onclick="startPrivateChat(${u.id}, '${u.username}')">
                    ${u.display_name || u.username} (@${u.username})
                </div>
            `).join('');
        }
        searchResults.style.display = 'block';
    } catch (error) {
        console.error('Ошибка поиска:', error);
    }
});

document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

async function startPrivateChat(otherUserId, username) {
    const chatId = `user_${otherUserId}`;
    openChat('private', chatId, username, otherUserId);
    searchResults.style.display = 'none';
    searchInput.value = '';
    await loadChats();
}

async function showCreateGroup() {
    document.getElementById('group-modal').style.display = 'flex';
    
    try {
        const resp = await fetch('/api/users?search=');
        const users = await resp.json();
        document.getElementById('group-members-list').innerHTML = users.map(u => `
            <div style="padding:8px;border-bottom:1px solid #f1f3f5;">
                <input type="checkbox" value="${u.id}" id="user_${u.id}">
                <label for="user_${u.id}">${u.display_name || u.username}</label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

async function createGroup() {
    const name = document.getElementById('group-name').value.trim();
    if (!name) {
        alert('Введите название группы');
        return;
    }
    
    const checkboxes = document.querySelectorAll('#group-members-list input[type="checkbox"]:checked');
    const members = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    try {
        const resp = await fetch('/api/create_group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, members })
        });
        const data = await resp.json();
        
        closeModal();
        await loadChats();
        openChat('group', `group_${data.group_id}`, data.group_name);
    } catch (error) {
        console.error('Ошибка создания группы:', error);
    }
}

function closeModal() {
    document.getElementById('group-modal').style.display = 'none';
    document.getElementById('group-name').value = '';
}

async function logout() {
    if (confirm('Выйти?')) {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    }
}

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

setInterval(() => {
    if (currentChatId) {
        loadMessages(currentChatId);
    }
}, 3000);

loadChats();