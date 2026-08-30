let currentChatId = null;
let currentChatType = null;
let currentChatName = '';

const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const privateChatsDiv = document.getElementById('private-chats');
const groupChatsDiv = document.getElementById('group-chats');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const currentChatNameSpan = document.getElementById('current-chat-name');

// Получить ID пользователя из HTML
const userId = window.userId || 0;

// ============ ЗАГРУЗКА ЧАТОВ ============
async function loadChats() {
    try {
        const resp = await fetch('/api/chats');
        if (!resp.ok) {
            console.error('Ошибка загрузки чатов:', resp.status);
            return;
        }
        const data = await resp.json();
        console.log('Чаты загружены:', data);
        
        privateChatsDiv.innerHTML = data.private.map(p => `
            <div class="chat-item" onclick="openChat('private', 'user_${p.id}', '${p.display_name || p.username}')">
                ${p.display_name || p.username}
            </div>
        `).join('');
        
        groupChatsDiv.innerHTML = data.groups.map(g => `
            <div class="chat-item" onclick="openChat('group', 'group_${g.id}', '${g.name}')">
                ${g.name} (${g.creator})
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

// ============ ОТКРЫТЬ ЧАТ ============
function openChat(type, chatId, name) {
    console.log('Открываем чат:', chatId, name);
    currentChatId = chatId;
    currentChatType = type;
    currentChatName = name;
    currentChatNameSpan.textContent = name;
    
    loadMessages(chatId);
}

// ============ ЗАГРУЗКА СООБЩЕНИЙ ============
async function loadMessages(chatId) {
    try {
        const resp = await fetch(`/api/messages/${chatId}`);
        if (!resp.ok) {
            console.error('Ошибка загрузки сообщений:', resp.status);
            messagesDiv.innerHTML = `<div style="color:red;">Ошибка загрузки сообщений (${resp.status})</div>`;
            return;
        }
        const messages = await resp.json();
        console.log('Сообщения:', messages);
        
        messagesDiv.innerHTML = messages.map(msg => {
            const isOwn = msg.sender_id == userId;
            return `<div class="message ${isOwn ? 'own' : ''}">
                <span class="msg-username">${msg.display_name || msg.username}</span>
                <span class="msg-text">${msg.text}</span>
                <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>`;
        }).join('');
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
        messagesDiv.innerHTML = `<div style="color:red;">Ошибка: ${error.message}</div>`;
    }
}

// ============ ОТПРАВКА СООБЩЕНИЯ ============
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
                chat_type: currentChatType,
                text: text
            })
        });
        if (!resp.ok) {
            console.error('Ошибка отправки:', resp.status);
            return;
        }
        msgInput.value = '';
        loadMessages(currentChatId);
    } catch (error) {
        console.error('Ошибка отправки:', error);
    }
}

// ============ ПОИСК ПОЛЬЗОВАТЕЛЕЙ ============
searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    
    if (query.length < 1) {
        searchResults.style.display = 'none';
        return;
    }
    
    try {
        const resp = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
        if (!resp.ok) {
            console.error('Ошибка поиска:', resp.status);
            return;
        }
        const users = await resp.json();
        console.log('Результаты поиска:', users);
        
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

// ============ ЗАКРЫТЬ ПОИСК ============
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

// ============ НАЧАТЬ ЛИЧНЫЙ ЧАТ ============
async function startPrivateChat(userId, username) {
    const chatId = `user_${userId}`;
    openChat('private', chatId, username);
    searchResults.style.display = 'none';
    searchInput.value = '';
    await loadChats();
}

// ============ СОЗДАНИЕ ГРУППЫ ============
async function showCreateGroup() {
    document.getElementById('group-modal').style.display = 'flex';
    
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

// ============ ВЫХОД ============
async function logout() {
    if (confirm('Выйти?')) {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    }
}

// ============ ОБРАБОТЧИКИ ============
sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ============ ЗАПУСК ============
console.log('Приложение запущено, userId:', userId);
loadChats();

setInterval(() => {
    if (currentChatId) {
        loadMessages(currentChatId);
    }
}, 3000);