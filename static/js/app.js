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
    try {
        const resp = await fetch(`/api/chats?user_id=${userId}`);
        const data = await resp.json();
        console.log('Чаты загружены:', data);
        
        privateChatsDiv.innerHTML = data.private.map(p => `
            <div class="chat-item" onclick="openChat('private', 'user_${p.id}', '${p.display_name || p.username}', ${p.id})">
                <div class="chat-avatar">${getAvatarHtml(p.avatar, p.display_name || p.username)}</div>
                ${p.display_name || p.username}
            </div>
        `).join('');
        
        groupChatsDiv.innerHTML = data.groups.map(g => `
            <div class="chat-item" onclick="openChat('group', 'group_${g.id}', '${g.name}')">
                <div class="chat-avatar">👥</div>
                ${g.name}
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
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

// ============ ЗАГРУЗКА СООБЩЕНИЙ ============
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
        
        if (messages.length === 0) {
            messagesDiv.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">Нет сообщений</div>';
            return;
        }
        
        let html = '';
        messages.forEach(msg => {
            const isOwn = msg.sender_id == userId;
            let content = msg.text || '';
            
            // Файлы
            if (msg.file_path) {
                const ext = msg.file_path.split('.').pop().toLowerCase();
                const fileUrl = msg.file_path;
                if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
                    content = `<img src="${fileUrl}" alt="Изображение" style="max-width:200px;border-radius:10px;display:block;margin-top:4px;">`;
                } else if (['mp4', 'webm', 'mov'].includes(ext)) {
                    content = `<video src="${fileUrl}" controls style="max-width:200px;border-radius:10px;display:block;margin-top:4px;"></video>`;
                } else if (['mp3', 'wav', 'ogg', 'webm'].includes(ext) && !['mp4'].includes(ext)) {
                    content = `<audio src="${fileUrl}" controls style="width:150px;height:40px;margin-top:4px;"></audio>`;
                } else {
                    content = `<a href="${fileUrl}" download style="display:inline-block;padding:6px 12px;background:#f1f3f5;border-radius:8px;text-decoration:none;color:#25D366;font-size:13px;margin-top:4px;">📎 Скачать файл</a>`;
                }
            }
            
            html += `<div class="message ${isOwn ? 'own' : 'other'}">
                <span class="msg-username">${msg.display_name || msg.username}</span>
                ${content}
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

// ============ ОТПРАВКА СООБЩЕНИЯ ============
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

// ============ ФАЙЛЫ ============
attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async function() {
    if (!currentChatId) {
        alert('Выберите чат');
        this.value = '';
        return;
    }
    
    const files = this.files;
    if (!files.length) return;
    
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('chat_id', currentChatId);
        formData.append('chat_type', currentChatType || 'private');
        
        try {
            const resp = await fetch(`/api/upload?user_id=${userId}`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                loadMessages(currentChatId);
            }
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
        }
    }
    this.value = '';
});

// ============ ГОЛОСОВЫЕ ============
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

recordBtn.addEventListener('mousedown', startRecording);
recordBtn.addEventListener('mouseup', stopRecording);
recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });

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
                const resp = await fetch(`/api/upload?user_id=${userId}`, {
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

// ============ НАЧАТЬ ЛИЧНЫЙ ЧАТ ============
async function startPrivateChat(otherUserId, username) {
    const chatId = 'user_' + otherUserId;
    openChat('private', chatId, username, otherUserId);
    searchResults.style.display = 'none';
    searchInput.value = '';
    await loadChats();
}

// ============ ГРУППЫ ============
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

// ============ ПРОФИЛЬ ============
async function showProfile() {
    const modal = document.getElementById('profile-modal');
    const content = document.getElementById('profile-content');
    const title = document.getElementById('profile-title');
    
    title.textContent = 'Мой профиль';
    modal.style.display = 'flex';
    
    try {
        const resp = await fetch(`/api/profile/${userId}?user_id=${userId}`);
        const user = await resp.json();
        
        content.innerHTML = `
            <div style="text-align:center;margin-bottom:20px;">
                <div class="avatar-preview" onclick="document.getElementById('avatar-input').click()">
                    ${getAvatarHtml(user.avatar, user.display_name || user.username)}
                </div>
                <input type="file" id="avatar-input" style="display:none" accept="image/png,image/jpeg,image/gif,image/webp" onchange="uploadAvatar(this.files[0])">
                <div style="font-size:12px;color:#999;">Нажми на аватар, чтобы изменить</div>
            </div>
            <div>
                <label style="font-weight:500;display:block;margin-bottom:5px;">Имя</label>
                <input type="text" id="profile-name" value="${user.display_name || ''}">
            </div>
            <div>
                <label style="font-weight:500;display:block;margin-bottom:5px;">О себе</label>
                <textarea id="profile-bio" style="resize:vertical;min-height:60px;">${user.bio || ''}</textarea>
            </div>
            <button onclick="saveProfile()" style="width:100%;background:#25D366;color:white;margin-top:10px;">Сохранить</button>
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
        const resp = await fetch(`/api/upload_avatar?user_id=${userId}`, {
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
        const resp = await fetch(`/api/update_profile?user_id=${userId}`, {
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
    document.getElementById('profile-modal').style.display = 'none';
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
msgInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
});

// ============ АВТООБНОВЛЕНИЕ ============
setInterval(function() {
    if (currentChatId) {
        console.log('🔄 Автообновление чата:', currentChatId);
        loadMessages(currentChatId);
    }
}, 2000);

// ============ ЗАПУСК ============
console.log('🚀 Запуск приложения, userId:', userId);
loadChats();