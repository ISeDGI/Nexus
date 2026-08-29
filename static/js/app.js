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
    console.log('📋 Загружаем чаты...');
    try {
        const resp = await fetch('/api/chats');
        if (!resp.ok) {
            console.error('Ошибка загрузки чатов:', resp.status);
            return;
        }
        const data = await resp.json();
        console.log('✅ Чаты загружены:', data);
        
        privateChatsDiv.innerHTML = data.private.map(p => `
            <div class="chat-item" onclick="openChat('private', 'user_${p.id}', '${p.display_name || p.username}', ${p.id})">
                <div class="chat-avatar">${(p.display_name || p.username)[0].toUpperCase()}</div>
                <span class="chat-name">${p.display_name || p.username}</span>
            </div>
        `).join('');
        
        groupChatsDiv.innerHTML = data.groups.map(g => `
            <div class="chat-item" onclick="openChat('group', 'group_${g.id}', '${g.name}')">
                <div class="chat-avatar">👥</div>
                <span class="chat-name">${g.name}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
    }
}

function openChat(type, chatId, name, otherUserId = null) {
    console.log('📂 Открываем чат:', chatId, name);
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
    console.log('📨 Загружаем сообщения для:', chatId);
    try {
        const resp = await fetch(`/api/messages/${chatId}`);
        console.log('📨 Ответ сервера:', resp.status);
        
        if (!resp.ok) {
            console.error('❌ Ошибка загрузки сообщений:', resp.status);
            messagesDiv.innerHTML = `<div style="color:red;text-align:center;padding:20px;">Ошибка загрузки сообщений (${resp.status})</div>`;
            return;
        }
        
        const messages = await resp.json();
        console.log('📨 Получено сообщений:', messages.length);
        
        if (messages.length === 0) {
            messagesDiv.innerHTML = '<div style="color:#868e96;text-align:center;padding:20px;">Нет сообщений. Напишите что-нибудь!</div>';
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
        console.log('✅ Сообщения отображены, всего:', messages.length);
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
        messagesDiv.innerHTML = `<div style="color:red;text-align:center;padding:20px;">Ошибка: ${error.message}</div>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendMessage() {
    console.log('✉️ Отправка сообщения...');
    console.log('✉️ currentChatId:', currentChatId);
    
    if (!currentChatId) {
        alert('Выберите чат');
        return;
    }
    
    const text = msgInput.value.trim();
    if (!text) {
        console.log('✉️ Пустое сообщение');
        return;
    }
    
    const payload = {
        chat_id: currentChatId,
        chat_type: currentChatType || 'private',
        text: text
    };
    console.log('✉️ Отправляемые данные:', payload);
    
    try {
        const resp = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        console.log('✉️ Ответ сервера:', data);
        
        if (!resp.ok) {
            console.error('❌ Ошибка отправки:', data);
            return;
        }
        
        msgInput.value = '';
        console.log('✉️ Сообщение отправлено, загружаем обновления...');
        loadMessages(currentChatId);
    } catch (error) {
        console.error('❌ Ошибка отправки:', error);
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
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div class="chat-avatar" style="width:30px;height:30px;font-size:14px;">${(u.display_name || u.username)[0].toUpperCase()}</div>
                        <div><strong>${u.display_name || u.username}</strong><br><span style="font-size:12px;color:#868e96;">@${u.username}</span></div>
                    </div>
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
    console.log('👤 Начинаем чат с:', username, 'ID:', otherUserId);
    const chatId = `user_${otherUserId}`;
    console.log('👤 chatId:', chatId);
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
            <div style="padding:8px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;gap:10px;">
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
        console.log('🔄 Автообновление:', currentChatId);
        loadMessages(currentChatId);
    }
}, 3000);

console.log('🚀 Приложение запущено, userId:', userId);
loadChats();