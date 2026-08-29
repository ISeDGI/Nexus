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
const fileInput = document.getElementById('file-input');
const attachBtn = document.getElementById('attach-btn');
const recordBtn = document.getElementById('record-btn');

const userId = window.userId || 0;

console.log('🚀 Приложение запущено, userId:', userId);

// ============ АВАТАРЫ ============
function getAvatarHtml(avatar, name) {
    if (avatar) {
        return `<img src="${avatar}" alt="${name}">`;
    }
    return (name || '?')[0].toUpperCase();
}

// ============ ЗАГРУЗКА ЧАТОВ ============
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
                <div class="chat-avatar">${getAvatarHtml(p.avatar, p.display_name || p.username)}</div>
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

// ============ ОТКРЫТЬ ЧАТ ============
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

// ============ ЗАГРУЗКА СООБЩЕНИЙ (ИСПРАВЛЕННАЯ) ============
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
        console.log('📨 Сообщения:', messages);
        
        if (messages.length === 0) {
            messagesDiv.innerHTML = '<div style="color:#868e96;text-align:center;padding:20px;">Нет сообщений. Напишите что-нибудь!</div>';
            return;
        }
        
        // ОТОБРАЖАЕМ ВСЕ СООБЩЕНИЯ БЕЗ ФИЛЬТРАЦИИ
        messagesDiv.innerHTML = messages.map(msg => {
            const isOwn = msg.sender_id == userId;
            let content = '';
            
            if (msg.text) {
                content = `<div class="msg-text">${escapeHtml(msg.text)}</div>`;
            }
            
            if (msg.file_path) {
                const ext = msg.file_path.split('.').pop().toLowerCase();
                const fileUrl = msg.file_path;
                
                if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
                    content += `<img src="${fileUrl}" alt="Изображение" loading="lazy">`;
                } else if (['mp4', 'webm', 'mov'].includes(ext)) {
                    content += `<video src="${fileUrl}" controls preload="metadata"></video>`;
                } else if (['mp3', 'wav', 'ogg', 'webm'].includes(ext) && !['mp4'].includes(ext)) {
                    content += `<audio src="${fileUrl}" controls preload="metadata"></audio>`;
                } else {
                    content += `<a href="${fileUrl}" download class="file-link">📎 Скачать файл</a>`;
                }
            }
            
            return `<div class="message ${isOwn ? 'own' : 'other'}">
                <span class="msg-username">${msg.display_name || msg.username}</span>
                ${content}
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

// ============ ОТПРАВКА ============
async function sendMessage() {
    console.log('✉️ Отправка сообщения...');
    if (!currentChatId) {
        alert('Выберите чат');
        return;
    }
    
    const text = msgInput.value.trim();
    if (!text) {
        console.log('✉️ Пустое сообщение');
        return;
    }
    
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
        const data = await resp.json();
        console.log('✉️ Ответ:', data);
        
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

// ============ ФАЙЛЫ ============
if (attachBtn) {
    attachBtn.addEventListener('click', () => fileInput.click());
}

if (fileInput) {
    fileInput.addEventListener('change', async () => {
        if (!currentChatId) {
            alert('Выберите чат');
            fileInput.value = '';
            return;
        }
        
        const files = fileInput.files;
        if (!files.length) return;
        
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('chat_id', currentChatId);
            formData.append('chat_type', currentChatType || 'private');
            
            try {
                const resp = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                if (resp.ok) {
                    loadMessages(currentChatId);
                }
            } catch (error) {
                console.error('Ошибка загрузки:', error);
            }
        }
        fileInput.value = '';
    });
}

// ============ ГОЛОСОВЫЕ ============
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

if (recordBtn) {
    recordBtn.addEventListener('mousedown', startRecording);
    recordBtn.addEventListener('mouseup', stopRecording);
    recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
    recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });
}

async function startRecording() {
    if (!currentChatId) {
        alert('Выберите чат');
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const file = new File([audioBlob], 'voice.webm', { type: 'audio/webm' });
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('chat_id', currentChatId);
            formData.append('chat_type', currentChatType || 'private');
            
            try {
                const resp = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                if (resp.ok) {
                    loadMessages(currentChatId);
                }
            } catch (error) {
                console.error('Ошибка отправки голосового:', error);
            }
            
            stream.getTracks().forEach(track => track.stop());
            isRecording = false;
            recordBtn.classList.remove('recording');
            recordBtn.textContent = '🎤';
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.textContent = '⏺';
    } catch (error) {
        console.error('Ошибка записи:', error);
        alert('Нет доступа к микрофону');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive' && isRecording) {
        mediaRecorder.stop();
    }
}

// ============ ПОИСК ============
if (searchInput) {
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
                            <div class="chat-avatar" style="width:30px;height:30px;font-size:14px;">${getAvatarHtml(u.avatar, u.display_name || u.username)}</div>
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
}

document.addEventListener('click', (e) => {
    if (searchInput && searchResults && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

// ============ НАЧАТЬ ЧАТ ============
async function startPrivateChat(otherUserId, username) {
    console.log('👤 Начинаем чат с:', username, 'ID:', otherUserId);
    const chatId = `user_${otherUserId}`;
    openChat('private', chatId, username, otherUserId);
    searchResults.style.display = 'none';
    searchInput.value = '';
    await loadChats();
}

// ============ ПРОФИЛЬ ============
async function showProfile() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    const content = document.getElementById('profile-content');
    const title = document.getElementById('profile-title');
    
    title.textContent = 'Мой профиль';
    modal.style.display = 'flex';
    
    try {
        const resp = await fetch(`/api/profile/${userId}`);
        const user = await resp.json();
        
        content.innerHTML = `
            <div style="text-align:center;margin-bottom:20px;">
                <div class="chat-avatar" style="width:80px;height:80px;font-size:32px;margin:0 auto;cursor:pointer;" onclick="document.getElementById('avatar-input').click()">
                    ${getAvatarHtml(user.avatar, user.display_name || user.username)}
                </div>
                <input type="file" id="avatar-input" style="display:none" accept="image/png,image/jpeg,image/gif,image/webp" onchange="uploadAvatar(this.files[0])">
                <div style="font-size:12px;color:#868e96;margin-top:5px;">Нажми на аватар, чтобы сменить</div>
            </div>
            <div style="margin-bottom:15px;">
                <label style="font-weight:500;display:block;margin-bottom:5px;">Отображаемое имя</label>
                <input type="text" id="profile-name" value="${user.display_name || ''}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="font-weight:500;display:block;margin-bottom:5px;">О себе</label>
                <textarea id="profile-bio" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;resize:vertical;min-height:60px;">${user.bio || ''}</textarea>
            </div>
            <button onclick="saveProfile()" style="width:100%;padding:10px;background:#25D366;color:white;border:none;border-radius:10px;cursor:pointer;">Сохранить</button>
        `;
    } catch (error) {
        content.innerHTML = '<div style="color:red;">Ошибка загрузки профиля</div>';
    }
}

async function uploadAvatar(file) {
    if (!file) return;
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
        const resp = await fetch('/api/upload_avatar', {
            method: 'POST',
            body: formData
        });
        const data = await resp.json();
        if (resp.ok) {
            alert('Аватар обновлён!');
            closeProfile();
            loadChats();
        } else {
            alert(data.error || 'Ошибка загрузки');
        }
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        alert('Ошибка загрузки');
    }
}

async function saveProfile() {
    const name = document.getElementById('profile-name').value.trim();
    const bio = document.getElementById('profile-bio').value.trim();
    
    try {
        const resp = await fetch('/api/update_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: name, bio })
        });
        if (resp.ok) {
            alert('Профиль обновлён!');
            closeProfile();
            loadChats();
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
    }
}

function closeProfile() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'none';
}

// ============ ПРОФИЛЬ СОБЕСЕДНИКА ============
async function showChatProfile() {
    if (!currentChatUserId) {
        alert('Выберите чат');
        return;
    }
    
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    const content = document.getElementById('profile-content');
    const title = document.getElementById('profile-title');
    
    title.textContent = 'Профиль пользователя';
    modal.style.display = 'flex';
    
    try {
        const resp = await fetch(`/api/profile/${currentChatUserId}`);
        const user = await resp.json();
        
        content.innerHTML = `
            <div style="text-align:center;margin-bottom:20px;">
                <div class="chat-avatar" style="width:80px;height:80px;font-size:32px;margin:0 auto;">
                    ${getAvatarHtml(user.avatar, user.display_name || user.username)}
                </div>
                <h3>${user.display_name || user.username}</h3>
                <div style="color:#868e96;font-size:14px;">@${user.username}</div>
                <div style="margin-top:10px;color:#495057;">${user.bio || 'Пока ничего о себе не рассказал'}</div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = '<div style="color:red;">Ошибка загрузки профиля</div>';
    }
}

// ============ ГРУППЫ ============
async function showCreateGroup() {
    const modal = document.getElementById('group-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    
    try {
        const resp = await fetch('/api/users?search=');
        const users = await resp.json();
        const list = document.getElementById('group-members-list');
        if (list) {
            list.innerHTML = users.map(u => `
                <div style="padding:8px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" value="${u.id}" id="user_${u.id}">
                    <label for="user_${u.id}">${u.display_name || u.username}</label>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

async function createGroup() {
    const nameInput = document.getElementById('group-name');
    if (!nameInput) return;
    const name = nameInput.value.trim();
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
    const modal = document.getElementById('group-modal');
    if (modal) modal.style.display = 'none';
    const nameInput = document.getElementById('group-name');
    if (nameInput) nameInput.value = '';
}

// ============ ВЫХОД ============
async function logout() {
    if (confirm('Выйти?')) {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    }
}

// ============ ОБРАБОТЧИКИ ============
if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}
if (msgInput) {
    msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// ============ АВТООБНОВЛЕНИЕ ============
setInterval(() => {
    if (currentChatId) {
        console.log('🔄 Автообновление:', currentChatId);
        loadMessages(currentChatId);
    }
}, 5000);

// ============ ЗАПУСК ============
console.log('🚀 Приложение запущено, userId:', userId);
loadChats();