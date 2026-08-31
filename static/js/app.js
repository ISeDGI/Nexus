// ========================================
// NEXUS — Полный клиентский JavaScript
// ========================================

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let currentChatId = null;
let currentChatType = null;
let currentChatUserId = null;
let currentChatName = '';
let allUsers = [];
let allGroups = [];
let unreadCounts = {};
let selectedMessageId = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

// ===== DOM ЭЛЕМЕНТЫ =====
const messagesContainer = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const attachBtn = document.getElementById('attach-btn');
const recordBtn = document.getElementById('record-btn');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const privateChatsContainer = document.getElementById('private-chats');
const groupChatsContainer = document.getElementById('group-chats');
const currentChatNameEl = document.getElementById('current-chat-name');
const chatAvatar = document.getElementById('chat-avatar');

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Nexus запущен, userId:', window.userId);
    loadChats();
    loadUsers();
    setupEventListeners();
    startStatusPolling();
});

// ===== СОБЫТИЯ =====
function setupEventListeners() {
    sendBtn.addEventListener('click', sendMessage);
    msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    
    recordBtn.addEventListener('click', toggleRecording);
    
    searchInput.addEventListener('input', handleSearch);
    
    // Закрытие меню при клике вне
    document.addEventListener('click', () => {
        const menu = document.getElementById('message-menu');
        if (menu) menu.classList.remove('active');
    });
}

// ===== ЗАГРУЗКА ЧАТОВ =====
async function loadChats() {
    try {
        const res = await fetch(`/api/chats?user_id=${window.userId}`);
        const data = await res.json();
        
        if (data.error) {
            console.error('Ошибка загрузки чатов:', data.error);
            return;
        }
        
        // Личные чаты
        privateChatsContainer.innerHTML = '';
        if (data.private && data.private.length > 0) {
            data.private.forEach(user => {
                const div = createChatItem(user, 'private');
                privateChatsContainer.appendChild(div);
            });
        } else {
            privateChatsContainer.innerHTML = '<div style="color:#999;padding:10px;font-size:13px;">Нет чатов</div>';
        }
        
        // Группы
        groupChatsContainer.innerHTML = '';
        if (data.groups && data.groups.length > 0) {
            data.groups.forEach(group => {
                const div = createChatItem(group, 'group');
                groupChatsContainer.appendChild(div);
            });
        } else {
            groupChatsContainer.innerHTML = '<div style="color:#999;padding:10px;font-size:13px;">Нет групп</div>';
        }
        
        allUsers = data.private || [];
        allGroups = data.groups || [];
        
        // Автоматический выбор первого чата
        if (data.private && data.private.length > 0) {
            selectChat(data.private[0].id, 'private');
        }
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

// ===== СОЗДАНИЕ ЭЛЕМЕНТА ЧАТА =====
function createChatItem(item, type) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    
    const name = type === 'private' ? (item.display_name || item.username) : item.name;
    const avatarText = name.charAt(0).toUpperCase();
    const avatarUrl = type === 'private' ? item.avatar : item.avatar;
    
    div.innerHTML = `
        <div class="chat-avatar">
            ${avatarUrl ? `<img src="${avatarUrl}" alt="${name}">` : avatarText}
        </div>
        <div class="chat-info">
            <span class="chat-name">${name}</span>
            <span class="unread-badge" id="unread-${type}-${item.id}" style="display:none;">0</span>
        </div>
    `;
    
    div.addEventListener('click', () => {
        if (type === 'private') {
            selectChat(item.id, 'private');
        } else {
            selectChat(item.id, 'group');
        }
    });
    
    return div;
}

// ===== ВЫБОР ЧАТА =====
async function selectChat(chatId, type) {
    currentChatId = chatId;
    currentChatType = type;
    
    // Обновляем подсветку
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const chatItems = document.querySelectorAll('.chat-item');
    for (const item of chatItems) {
        if (item.querySelector('.chat-name')?.textContent === currentChatName) {
            item.classList.add('active');
        }
    }
    
    // Получаем имя чата
    if (type === 'private') {
        const user = allUsers.find(u => u.id == chatId);
        if (user) {
            currentChatName = user.display_name || user.username;
            currentChatUserId = user.id;
        }
    } else {
        const group = allGroups.find(g => g.id == chatId);
        if (group) {
            currentChatName = group.name;
            currentChatUserId = null;
        }
    }
    
    currentChatNameEl.textContent = currentChatName || 'Чат';
    chatAvatar.textContent = currentChatName ? currentChatName.charAt(0).toUpperCase() : '👤';
    
    // Загружаем сообщения
    await loadMessages(chatId);
    
    // Сбрасываем непрочитанные
    const badge = document.getElementById(`unread-${type}-${chatId}`);
    if (badge) {
        badge.style.display = 'none';
        badge.textContent = '0';
    }
}

// ===== ЗАГРУЗКА СООБЩЕНИЙ =====
async function loadMessages(chatId) {
    try {
        const res = await fetch(`/api/messages/${chatId}?user_id=${window.userId}`);
        const messages = await res.json();
        
        messagesContainer.innerHTML = '';
        
        if (messages.error) {
            messagesContainer.innerHTML = `<div style="color:#999;text-align:center;padding:20px;">${messages.error}</div>`;
            return;
        }
        
        if (messages.length === 0) {
            messagesContainer.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">Нет сообщений. Напишите первым!</div>';
            return;
        }
        
        messages.forEach(msg => {
            displayMessage(msg);
        });
        
        scrollToBottom();
        
        // Отмечаем сообщения как прочитанные
        markMessagesAsRead(messages);
        
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
        messagesContainer.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">Ошибка загрузки сообщений</div>';
    }
}

// ===== ОТОБРАЖЕНИЕ СООБЩЕНИЯ =====
function displayMessage(msg) {
    const isOwn = msg.sender_id == window.userId;
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.dataset.messageId = msg.id;
    div.dataset.senderId = msg.sender_id;
    
    // Имя отправителя (для групповых чатов)
    let usernameHtml = '';
    if (currentChatType === 'group' && !isOwn) {
        usernameHtml = `<span class="msg-username">${msg.display_name || msg.username}:</span>`;
    }
    
    // Текст
    let content = msg.text || '';
    if (msg.file_path) {
        const ext = msg.file_path.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
            content = `<img src="${msg.file_path}" style="max-width:200px;max-height:200px;border-radius:10px;display:block;">`;
        } else {
            content = `<a href="${msg.file_path}" target="_blank" style="color:${isOwn ? '#fff' : '#007AFF'};">📎 ${msg.file_path.split('/').pop()}</a>`;
        }
    }
    
    // Время и статус
    const time = new Date(msg.timestamp);
    const timeStr = time.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
    
    let statusHtml = '';
    if (isOwn) {
        const status = msg.status || 'sent';
        const isRead = msg.is_read || false;
        statusHtml = getStatusIconsHtml(status, isRead);
    }
    
    div.innerHTML = `
        <div>
            ${usernameHtml}
            <span>${content}</span>
            <span class="msg-time">${timeStr} ${statusHtml}</span>
        </div>
    `;
    
    // Клик для открытия меню
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        openMessageMenu(e.clientX, e.clientY, msg.id, isOwn, msg.text || '');
    });
    
    messagesContainer.appendChild(div);
}

// ===== ГАЛОЧКИ СТАТУСА =====
function getStatusIconsHtml(status, isRead) {
    let html = '<span class="status-icons" style="display:inline-flex;align-items:center;gap:1px;margin-left:4px;">';
    
    // Первая галочка (отправлено)
    const check1Class = (status === 'sent' || status === 'delivered' || status === 'read' || isRead) ? 'sent' : '';
    html += `<span class="check ${check1Class}" style="font-size:12px;color:${check1Class ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)'};">✓</span>`;
    
    // Вторая галочка (доставлено/прочитано)
    if (status === 'delivered' || status === 'read' || isRead) {
        let color = 'rgba(255,255,255,0.5)';
        if (status === 'read' || isRead) color = '#4FC3F7';
        else if (status === 'delivered') color = 'rgba(255,255,255,0.8)';
        html += `<span class="check" style="font-size:12px;color:${color};">✓</span>`;
    }
    
    html += '</span>';
    return html;
}

// ===== МЕНЮ СООБЩЕНИЯ =====
function openMessageMenu(x, y, messageId, isOwn, text) {
    // Удаляем старое меню
    const oldMenu = document.getElementById('message-menu');
    if (oldMenu) oldMenu.remove();
    
    // Создаём меню
    const menu = document.createElement('div');
    menu.id = 'message-menu';
    menu.style.cssText = `
        position: fixed;
        background: white;
        border-radius: 12px;
        padding: 8px 0;
        min-width: 180px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.15);
        z-index: 1000;
        border: 1px solid #e8edf5;
        display: block;
        left: ${Math.min(x, window.innerWidth - 200)}px;
        top: ${Math.min(y, window.innerHeight - 120)}px;
        animation: fadeIn 0.2s ease;
    `;
    
    // Кнопка "Удалить" (только для своих)
    if (isOwn) {
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'menu-item danger';
        deleteBtn.style.cssText = `
            padding: 10px 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 14px;
            color: #e74c3c;
        `;
        deleteBtn.innerHTML = '🗑️ Удалить сообщение';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm('Удалить это сообщение?')) {
                await deleteMessage(messageId);
            }
            menu.remove();
        };
        menu.appendChild(deleteBtn);
    }
    
    // Кнопка "Ответить"
    const replyBtn = document.createElement('div');
    replyBtn.className = 'menu-item';
    replyBtn.style.cssText = `
        padding: 10px 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: #1a1a2e;
    `;
    replyBtn.innerHTML = '💬 Ответить';
    replyBtn.onclick = (e) => {
        e.stopPropagation();
        msgInput.value = `Ответ: "${text}"\n`;
        msgInput.focus();
        menu.remove();
    };
    menu.appendChild(replyBtn);
    
    // Кнопка "Копировать"
    const copyBtn = document.createElement('div');
    copyBtn.className = 'menu-item';
    copyBtn.style.cssText = `
        padding: 10px 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: #1a1a2e;
    `;
    copyBtn.innerHTML = '📋 Копировать текст';
    copyBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            alert('✅ Текст скопирован!');
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            alert('✅ Текст скопирован!');
        }
        menu.remove();
    };
    menu.appendChild(copyBtn);
    
    document.body.appendChild(menu);
}

// ===== УДАЛЕНИЕ СООБЩЕНИЯ =====
async function deleteMessage(messageId) {
    try {
        const res = await fetch(`/api/messages/${messageId}?user_id=${window.userId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.status === 'ok') {
            const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (msgEl) msgEl.remove();
        } else {
            alert('Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Не удалось удалить сообщение');
    }
}

// ===== ОТМЕТКА ПРОЧИТАННОГО =====
async function markMessagesAsRead(messages) {
    const unread = messages.filter(m => m.sender_id != window.userId && !m.is_read);
    for (const msg of unread) {
        try {
            await fetch(`/api/messages/${msg.id}/read?user_id=${window.userId}`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Ошибка отметки прочитанного:', error);
        }
    }
}

// ===== ПОЛЛИНГ СТАТУСОВ =====
function startStatusPolling() {
    setInterval(async () => {
        if (!currentChatId) return;
        
        try {
            const res = await fetch(`/api/messages/${currentChatId}?user_id=${window.userId}`);
            const messages = await res.json();
            
            // Обновляем статусы галочек
            const msgElements = document.querySelectorAll('.message');
            for (const el of msgElements) {
                const msgId = el.dataset.messageId;
                const msg = messages.find(m => m.id == msgId);
                if (msg && msg.sender_id == window.userId) {
                    const timeSpan = el.querySelector('.msg-time');
                    if (timeSpan) {
                        // Обновляем статус
                        const statusIcons = timeSpan.querySelector('.status-icons');
                        if (statusIcons) {
                            const checks = statusIcons.querySelectorAll('.check');
                            const status = msg.status || 'sent';
                            const isRead = msg.is_read || false;
                            
                            if (checks.length >= 1) {
                                checks[0].style.color = (status === 'sent' || status === 'delivered' || status === 'read' || isRead) 
                                    ? 'rgba(255,255,255,0.8)' 
                                    : 'rgba(255,255,255,0.3)';
                            }
                            if (checks.length >= 2) {
                                let color = 'rgba(255,255,255,0.5)';
                                if (status === 'read' || isRead) color = '#4FC3F7';
                                else if (status === 'delivered') color = 'rgba(255,255,255,0.8)';
                                checks[1].style.color = color;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            // Игнорируем ошибки
        }
    }, 3000);
}

// ===== ОТПРАВКА СООБЩЕНИЯ =====
async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !currentChatId) return;
    
    try {
        const res = await fetch(`/api/send?user_id=${window.userId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                chat_id: currentChatId,
                chat_type: currentChatType,
                text: text
            })
        });
        
        const data = await res.json();
        if (data.status === 'ok') {
            msgInput.value = '';
            await loadMessages(currentChatId);
        } else {
            alert('Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка отправки:', error);
        alert('Не удалось отправить сообщение');
    }
}

// ===== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ =====
async function loadUsers() {
    try {
        const res = await fetch(`/api/users?user_id=${window.userId}`);
        const users = await res.json();
        if (!users.error) {
            allUsers = users;
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

// ===== ПОИСК =====
async function handleSearch() {
    const query = searchInput.value.trim();
    const resultsDiv = document.getElementById('search-results');
    
    if (query.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }
    
    try {
        const res = await fetch(`/api/users?user_id=${window.userId}&search=${encodeURIComponent(query)}`);
        const users = await res.json();
        
        if (users.error) {
            resultsDiv.style.display = 'none';
            return;
        }
        
        resultsDiv.innerHTML = '';
        if (users.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:10px;color:#999;">Пользователи не найдены</div>';
            resultsDiv.style.display = 'block';
            return;
        }
        
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `
                <div class="chat-avatar" style="width:30px;height:30px;font-size:12px;">
                    ${user.avatar ? `<img src="${user.avatar}" alt="">` : (user.display_name || user.username).charAt(0).toUpperCase()}
                </div>
                <span>${user.display_name || user.username}</span>
            `;
            div.onclick = () => {
                startPrivateChat(user.id);
                resultsDiv.style.display = 'none';
                searchInput.value = '';
            };
            resultsDiv.appendChild(div);
        });
        
        resultsDiv.style.display = 'block';
    } catch (error) {
        console.error('Ошибка поиска:', error);
    }
}

// ===== НАЧАЛО ЛИЧНОГО ЧАТА =====
async function startPrivateChat(userId) {
    const chatId = `user_${userId}`;
    await loadChats();
    selectChat(userId, 'private');
}

// ===== ФАЙЛЫ =====
async function handleFileUpload() {
    const files = fileInput.files;
    if (!files.length || !currentChatId) return;
    
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('chat_id', currentChatId);
        formData.append('chat_type', currentChatType);
        
        try {
            const res = await fetch(`/api/upload?user_id=${window.userId}`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status === 'ok') {
                await loadMessages(currentChatId);
            }
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
        }
    }
    
    fileInput.value = '';
}

// ===== ГОЛОСОВЫЕ СООБЩЕНИЯ =====
function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
            
            const formData = new FormData();
            formData.append('file', audioFile);
            formData.append('chat_id', currentChatId);
            formData.append('chat_type', currentChatType);
            
            try {
                const res = await fetch(`/api/upload?user_id=${window.userId}`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    await loadMessages(currentChatId);
                }
            } catch (error) {
                console.error('Ошибка отправки голосового:', error);
            }
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordBtn.textContent = '⏹';
        recordBtn.classList.add('recording');
    } catch (error) {
        console.error('Ошибка доступа к микрофону:', error);
        alert('Не удалось получить доступ к микрофону');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        recordBtn.textContent = '🎤';
        recordBtn.classList.remove('recording');
    }
}

// ===== ГРУППЫ =====
async function showCreateGroup() {
    const modal = document.getElementById('group-modal');
    const list = document.getElementById('group-members-list');
    modal.style.display = 'flex';
    
    try {
        const res = await fetch(`/api/users?user_id=${window.userId}`);
        const users = await res.json();
        
        list.innerHTML = '';
        users.forEach(user => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.style.margin = '5px 0';
            label.innerHTML = `
                <input type="checkbox" value="${user.id}">
                ${user.display_name || user.username}
            `;
            list.appendChild(label);
        });
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
        const res = await fetch(`/api/create_group?user_id=${window.userId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, members })
        });
        const data = await res.json();
        
        if (data.group_id) {
            closeModal();
            await loadChats();
            selectChat(data.group_id, 'group');
        } else {
            alert('Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка создания группы:', error);
    }
}

function closeModal() {
    document.getElementById('group-modal').style.display = 'none';
}

// ===== ПРОФИЛЬ =====
function showProfile() {
    // Заглушка — открываем профиль пользователя
    showUserProfile(window.userId);
}

async function showUserProfile(userId) {
    if (!userId) return;
    
    const modal = document.getElementById('profile-modal');
    const content = document.getElementById('profile-content');
    const title = document.getElementById('profile-title');
    
    modal.style.display = 'flex';
    title.textContent = '👤 Профиль';
    
    try {
        const res = await fetch(`/api/profile/${userId}?user_id=${window.userId}`);
        const user = await res.json();
        
        if (user.error) {
            content.innerHTML = `<div style="color:#999;">${user.error}</div>`;
            return;
        }
        
        const avatarText = (user.display_name || user.username).charAt(0).toUpperCase();
        const avatarHtml = user.avatar 
            ? `<img src="${user.avatar}" alt="аватар">` 
            : avatarText;
        
        content.innerHTML = `
            <div class="avatar-preview" style="width:80px;height:80px;border-radius:50%;margin:0 auto 15px;display:flex;align-items:center;justify-content:center;background:#007AFF;color:white;font-size:32px;overflow:hidden;">
                ${avatarHtml}
            </div>
            <p><strong>Имя:</strong> ${user.display_name || user.username}</p>
            <p><strong>Ник:</strong> @${user.username}</p>
            <p><strong>О себе:</strong> ${user.bio || 'Не указано'}</p>
            ${userId == window.userId ? `
                <hr style="margin:15px 0;">
                <div style="margin-top:10px;">
                    <input type="text" id="edit-display-name" placeholder="Отображаемое имя" value="${user.display_name || ''}">
                    <textarea id="edit-bio" placeholder="О себе" rows="2">${user.bio || ''}</textarea>
                    <button onclick="updateProfile()" style="width:100%;padding:10px;background:#007AFF;color:white;border:none;border-radius:10px;cursor:pointer;">Сохранить</button>
                </div>
                <div style="margin-top:10px;">
                    <input type="password" id="edit-old-pass" placeholder="Старый пароль">
                    <input type="password" id="edit-new-pass" placeholder="Новый пароль">
                    <button onclick="changePassword()" style="width:100%;padding:10px;background:#28a745;color:white;border:none;border-radius:10px;cursor:pointer;">Сменить пароль</button>
                </div>
            ` : ''}
        `;
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
        content.innerHTML = '<div style="color:#999;">Ошибка загрузки профиля</div>';
    }
}

function closeProfile() {
    document.getElementById('profile-modal').style.display = 'none';
}

// ===== ОБНОВЛЕНИЕ ПРОФИЛЯ =====
async function updateProfile() {
    const displayName = document.getElementById('edit-display-name')?.value;
    const bio = document.getElementById('edit-bio')?.value;
    
    if (!displayName) {
        alert('Введите отображаемое имя');
        return;
    }
    
    try {
        const res = await fetch(`/api/update_profile?user_id=${window.userId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ display_name: displayName, bio })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            alert('✅ Профиль обновлён!');
            closeProfile();
            await loadChats();
        } else {
            alert('Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        alert('Не удалось обновить профиль');
    }
}

// ===== СМЕНА ПАРОЛЯ =====
async function changePassword() {
    const oldPass = document.getElementById('edit-old-pass')?.value;
    const newPass = document.getElementById('edit-new-pass')?.value;
    
    if (!oldPass || !newPass) {
        alert('Заполните все поля');
        return;
    }
    
    if (newPass.length < 4) {
        alert('Новый пароль должен быть минимум 4 символа');
        return;
    }
    
    try {
        const res = await fetch(`/api/change_password?user_id=${window.userId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ old_password: oldPass, new_password: newPass })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            alert('✅ Пароль изменён!');
            document.getElementById('edit-old-pass').value = '';
            document.getElementById('edit-new-pass').value = '';
        } else {
            alert('Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка смены пароля:', error);
        alert('Не удалось сменить пароль');
    }
}

// ===== ВЫХОД =====
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Ошибка выхода:', error);
        window.location.href = '/';
    }
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Экспортируем функции для inline onclick
window.showCreateGroup = showCreateGroup;
window.createGroup = createGroup;
window.closeModal = closeModal;
window.showProfile = showProfile;
window.showUserProfile = showUserProfile;
window.closeProfile = closeProfile;
window.updateProfile = updateProfile;
window.changePassword = changePassword;
window.logout = logout;
window.selectChat = selectChat;
window.loadChats = loadChats;
window.sendMessage = sendMessage;

console.log('✅ Nexus app.js загружен');