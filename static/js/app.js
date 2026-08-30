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

const userId = window.userId || 0;
console.log('🚀 Приложение запущено, userId:', userId);

// Загрузка чатов
async function loadChats() {
    try {
        const resp = await fetch(`/api/chats?user_id=${userId}`);
        const data = await resp.json();
        console.log('Чаты загружены:', data);
        
        privateChatsDiv.innerHTML = data.private.map(p => `
            <div class="chat-item" onclick="openChat('private', 'user_${p.id}', '${p.display_name || p.username}', ${p.id})">
                ${p.display_name || p.username}
            </div>
        `).join('');
        
        groupChatsDiv.innerHTML = data.groups.map(g => `
            <div class="chat-item" onclick="openChat('group', 'group_${g.id}', '${g.name}')">
                ${g.name}
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

// Открыть чат
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

// Загрузить сообщения
async function loadMessages(chatId) {
    console.log('📨 Загружаем сообщения для:', chatId);
    try {
        const resp = await fetch(`/api/messages/${chatId}?user_id=${userId}`);
        if (!resp.ok) {
            messagesDiv.innerHTML = '<div style="color:red;text-align:center;padding:20px;">Ошибка загрузки</div>';
            return;
        }
        const messages = await resp.json();
        console.log('📨 Получено сообщений:', messages.length);
        console.log('📨 Сообщения:', messages);
        
        if (messages.length === 0) {
            messagesDiv.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">Нет сообщений</div>';
            return;
        }
        
        let html = '';
        messages.forEach(msg => {
            const isOwn = msg.sender_id == userId;
            html += `<div class="message ${isOwn ? 'own' : 'other'}">
                <span class="msg-username">${msg.display_name || msg.username}</span>
                ${msg.text}
                <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>`;
        });
        messagesDiv.innerHTML = html;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        console.log('✅ Сообщения отображены, всего:', messages.length);
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
        messagesDiv.innerHTML = '<div style="color:red;text-align:center;padding:20px;">Ошибка загрузки</div>';
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
    
    console.log('✉️ Отправка:', text, 'в чат:', currentChatId);
    
    try {
        const resp = await fetch(`/api/send?user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: currentChatId,
                chat_type: currentChatType || 'private',
                text: text
            })
        });
        const data = await resp.json();
        console.log('✉️ Ответ:', data);
        
        if (resp.ok) {
            msgInput.value = '';
            loadMessages(currentChatId);
        } else {
            alert('Ошибка отправки: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки:', error);
        alert('Ошибка соединения');
    }
}

// Поиск пользователей
searchInput.addEventListener('input', async function() {
    const query = this.value.trim();
    if (query.length < 1) {
        searchResults.style.display = 'none';
        return;
    }
    
    try {
        const resp = await fetch(`/api/users?user_id=${userId}&search=${encodeURIComponent(query)}`);
        const users = await resp.json();
        console.log('Результаты поиска:', users);
        
        if (users.length === 0) {
            searchResults.innerHTML = '<div class="result-item">Ничего не найдено</div>';
        } else {
            searchResults.innerHTML = users.map(u => `
                <div class="result-item" onclick="startPrivateChat(${u.id}, '${u.username}')">
                    ${u.display_name || u.username}
                </div>
            `).join('');
        }
        searchResults.style.display = 'block';
    } catch (error) {
        console.error('Ошибка поиска:', error);
    }
});

document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

// Начать личный чат
async function startPrivateChat(otherUserId, username) {
    const chatId = 'user_' + otherUserId;
    openChat('private', chatId, username, otherUserId);
    searchResults.style.display = 'none';
    searchInput.value = '';
    await loadChats();
}

// Создание группы
async function showCreateGroup() {
    document.getElementById('group-modal').style.display = 'flex';
    
    try {
        const resp = await fetch(`/api/users?user_id=${userId}&search=`);
        const users = await resp.json();
        document.getElementById('group-members-list').innerHTML = users.map(u => `
            <div><input type="checkbox" value="${u.id}"> ${u.display_name || u.username}</div>
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
    
    const checkboxes = document.querySelectorAll('#group-members-list input:checked');
    const members = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    try {
        const resp = await fetch(`/api/create_group?user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, members })
        });
        const data = await resp.json();
        console.log('Группа создана:', data);
        closeModal();
        await loadChats();
        openChat('group', 'group_' + data.group_id, data.group_name);
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
msgInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
});

// Автообновление каждые 2 секунды
setInterval(function() {
    if (currentChatId) {
        console.log('🔄 Автообновление чата:', currentChatId);
        loadMessages(currentChatId);
    }
}, 2000);

// Запуск
console.log('🚀 Запуск приложения, userId:', userId);
loadChats();