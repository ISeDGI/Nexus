let currentChatId = null;
let currentChatType = null;
let currentChatName = '';
let username = '';

// DOM элементы
const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const privateChatsDiv = document.getElementById('private-chats');
const groupChatsDiv = document.getElementById('group-chats');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const currentChatNameSpan = document.getElementById('current-chat-name');
const usernameDisplay = document.getElementById('username-display');

// Загрузка чатов
async function loadChats() {
    try {
        const resp = await fetch('/api/chats');
        const data = await resp.json();
        
        // Личные чаты
        privateChatsDiv.innerHTML = data.private.map(p => `
            <div class="chat-item" onclick="openChat('private', 'user_${p.user_id}', '${p.display_name || p.username}')">
                ${p.display_name || p.username}
            </div>
        `).join('');
        
        // Группы
        groupChatsDiv.innerHTML = data.groups.map(g => `
            <div class="chat-item" onclick="openChat('group', 'group_${g.id}', '${g.name}')">
                ${g.name} (${g.creator})
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

// Открыть чат
function openChat(type, chatId, name) {
    currentChatId = chatId;
    currentChatType = type;
    currentChatName = name;
    currentChatNameSpan.textContent = name;
    
    // Подсветка активного чата
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
    
    loadMessages(chatId);
}

// Загрузить сообщения
async function loadMessages(chatId) {
    try {
        const resp = await fetch(`/api/messages/${chatId}`);
        const messages = await resp.json();
        
        messagesDiv.innerHTML = messages.map(msg => {
            const isOwn = msg.sender_id == window.userId;
            return `<div class="message ${isOwn ? 'own' : ''}">
                <span class="msg-username">${msg.display_name || msg.username}</span>
                <span class="msg-text">${msg.text}</span>
                <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>`;
        }).join('');
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

// Отправить сообщение
async function sendMessage() {
    if (!currentChatId) {
        alert('Выберите чат');
        return;
    }
    
    const text = msgInput.value.trim();
    if (!text) return;
    
    try {
        await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: currentChatId,
                chat_type: currentChatType,
                text: text
            })
        });
        msgInput.value = '';
        loadMessages(currentChatId);
    } catch (error) {
        console.error('Ошибка отправки:', error);
    }
}

// Поиск пользователей
searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
    }
    
    try {
        const resp = await fetch(`/api/users?search=${query}`);
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

// Закрыть поиск при клике вне
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

// Начать личный чат
async function startPrivateChat(userId, username) {
    const chatId = `user_${userId}`;
    openChat('private', chatId, username);
    searchResults.style.display = 'none';
    searchInput.value = '';
    await loadChats();
}

// Создание группы
async function showCreateGroup() {
    document.getElementById('group-modal').style.display = 'flex';
    
    // Загрузить список пользователей для добавления
    try {
        const resp = await fetch('/api/users?search=');
        const users = await resp.json();
        document.getElementById('group-members-list').innerHTML = users.map(u => `
            <div>
                <input type="checkbox" value="${u.id}">
                <label>${u.display_name || u.username}</label>
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

// Выход
async function logout() {
    if (confirm('Выйти?')) {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    }
}

// Обработчики
sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Получить ID текущего пользователя
window.userId = {{ user_id }};

// Загрузить чаты при старте
loadChats();

// Обновлять сообщения каждые 3 секунды
setInterval(() => {
    if (currentChatId) {
        loadMessages(currentChatId);
    }
}, 3000);