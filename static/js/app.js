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
const userId = window.userId || 0;

async function loadChats() {
    try {
        const resp = await fetch('/api/chats');
        if (!resp.ok) return;
        const data = await resp.json();
        privateChatsDiv.innerHTML = data.private.map(p => `
            <div class="chat-item" onclick="openChat('private', 'user_${p.id}', '${p.display_name || p.username}')">
                ${p.display_name || p.username}
            </div>
        `).join('');
        groupChatsDiv.innerHTML = data.groups.map(g => `
            <div class="chat-item" onclick="openChat('group', 'group_${g.id}', '${g.name}')">
                ${g.name}
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

function openChat(type, chatId, name) {
    currentChatId = chatId;
    currentChatType = type;
    currentChatName = name;
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
        if (!resp.ok) { messagesDiv.innerHTML = '<div style="color:red;">Ошибка</div>'; return; }
        const messages = await resp.json();
        if (messages.length === 0) { messagesDiv.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">Нет сообщений</div>'; return; }
        messagesDiv.innerHTML = messages.map(msg => {
            const isOwn = msg.sender_id == userId;
            return `<div class="message ${isOwn ? 'own' : 'other'}">
                <span class="msg-username">${msg.display_name || msg.username}</span>
                <span>${msg.text}</span>
                <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>`;
        }).join('');
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (e) { console.error(e); }
}

async function sendMessage() {
    if (!currentChatId) { alert('Выберите чат'); return; }
    const text = msgInput.value.trim();
    if (!text) return;
    try {
        await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: currentChatId, chat_type: currentChatType || 'private', text })
        });
        msgInput.value = '';
        loadMessages(currentChatId);
    } catch (e) { console.error(e); }
}

searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    if (query.length < 1) { searchResults.style.display = 'none'; return; }
    try {
        const resp = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
        const users = await resp.json();
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
    } catch (e) { console.error(e); }
});

document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

async function startPrivateChat(userId, username) {
    const chatId = `user_${userId}`;
    openChat('private', chatId, username);
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
            <div><input type="checkbox" value="${u.id}"> ${u.display_name || u.username}</div>
        `).join('');
    } catch (e) { console.error(e); }
}

async function createGroup() {
    const name = document.getElementById('group-name').value.trim();
    if (!name) { alert('Введите название'); return; }
    const checkboxes = document.querySelectorAll('#group-members-list input:checked');
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
    } catch (e) { console.error(e); }
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
msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
setInterval(() => { if (currentChatId) loadMessages(currentChatId); }, 3000);
loadChats();