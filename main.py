from flask import Flask, render_template, request, jsonify, session, send_from_directory
import sqlite3
import hashlib
import secrets
import os
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'pdf', 'doc', 'docx', 'txt', 'zip', 'mp3', 'wav', 'ogg'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_db():
    db_path = os.path.join(os.path.dirname(__file__), 'database', 'data_source.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ========== СОЗДАНИЕ ТАБЛИЦ ==========
os.makedirs('database', exist_ok=True)
conn = sqlite3.connect('database/data_source.db')
cursor = conn.cursor()

# Таблица пользователей
cursor.execute('''
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    bio TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
''')

# Таблица сообщений (с полями status и is_read!)
cursor.execute('''
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL,
    chat_type TEXT NOT NULL,
    text TEXT,
    file_path TEXT,
    status TEXT DEFAULT 'sent',
    is_read INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id)
)
''')

# Таблица групп
cursor.execute('''
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
)
''')

# Таблица участников групп
cursor.execute('''
CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
)
''')

# Таблица для отслеживания прочтения
cursor.execute('''
CREATE TABLE IF NOT EXISTS read_receipts (
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
''')

conn.commit()
conn.close()
print("✅ Таблицы проверены/созданы")

# ========== МАРШРУТЫ ==========

@app.route('/')
def index():
    user_id = request.args.get('user_id')
    if user_id:
        db = get_db()
        user = db.execute('SELECT id, username FROM users WHERE id = ?', (user_id,)).fetchone()
        db.close()
        if user:
            return render_template('chat.html', user_id=user['id'], username=user['username'])
    
    if 'user_id' in session:
        return render_template('chat.html', user_id=session['user_id'], username=session['username'])
    
    return render_template('login.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# ========== АВТОРИЗАЦИЯ ==========

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        display_name = data.get('display_name', username)
        
        db = get_db()
        existing = db.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
        if existing:
            db.close()
            return jsonify({'error': 'Ник уже занят'}), 400
        
        hashed = hash_password(password)
        db.execute(
            'INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)',
            (username, hashed, display_name)
        )
        db.commit()
        db.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        db = get_db()
        user = db.execute(
            'SELECT * FROM users WHERE username = ? AND password = ?',
            (username, hash_password(password))
        ).fetchone()
        db.close()
        
        if not user:
            return jsonify({'error': 'Неверный логин или пароль'}), 401
        
        session['user_id'] = user['id']
        session['username'] = user['username']
        
        return jsonify({'status': 'ok', 'user_id': user['id']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'status': 'ok'})

@app.route('/api/users', methods=['GET'])
def get_users():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        search = request.args.get('search', '')
        db = get_db()
        users = db.execute(
            'SELECT id, username, display_name, avatar FROM users WHERE username LIKE ? AND id != ?',
            (f'%{search}%', user_id)
        ).fetchall()
        db.close()
        return jsonify([dict(u) for u in users])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========== ПРОФИЛЬ ==========

@app.route('/api/profile/<int:user_id>', methods=['GET'])
def get_profile(user_id):
    try:
        current_user_id = request.args.get('user_id') or session.get('user_id')
        if not current_user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        user = db.execute(
            'SELECT id, username, display_name, bio, avatar FROM users WHERE id = ?',
            (user_id,)
        ).fetchone()
        db.close()
        
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        return jsonify(dict(user))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update_profile', methods=['POST'])
def update_profile():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        data = request.get_json()
        display_name = data.get('display_name')
        bio = data.get('bio')
        
        db = get_db()
        db.execute(
            'UPDATE users SET display_name = ?, bio = ? WHERE id = ?',
            (display_name, bio, user_id)
        )
        db.commit()
        db.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/change_password', methods=['POST'])
def change_password():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        data = request.get_json()
        old_password = data.get('old_password')
        new_password = data.get('new_password')
        
        if not old_password or not new_password:
            return jsonify({'error': 'Заполните все поля'}), 400
        
        if len(new_password) < 4:
            return jsonify({'error': 'Новый пароль должен содержать минимум 4 символа'}), 400
        
        db = get_db()
        user = db.execute(
            'SELECT id, password FROM users WHERE id = ?',
            (user_id,)
        ).fetchone()
        
        if not user:
            db.close()
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        if user['password'] != hash_password(old_password):
            db.close()
            return jsonify({'error': 'Неверный старый пароль'}), 401
        
        db.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            (hash_password(new_password), user_id)
        )
        db.commit()
        db.close()
        
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload_avatar', methods=['POST'])
def upload_avatar():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        if 'avatar' not in request.files:
            return jsonify({'error': 'Нет файла'}), 400
        
        file = request.files['avatar']
        if file.filename == '':
            return jsonify({'error': 'Файл не выбран'}), 400
        
        allowed = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        if ext not in allowed:
            return jsonify({'error': 'Недопустимый формат'}), 400
        
        filename = secure_filename(file.filename)
        unique_name = f"avatar_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        
        db = get_db()
        db.execute(
            'UPDATE users SET avatar = ? WHERE id = ?',
            (f"/uploads/{unique_name}", user_id)
        )
        db.commit()
        db.close()
        
        return jsonify({'status': 'ok', 'avatar': f"/uploads/{unique_name}"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========== СООБЩЕНИЯ (ОБНОВЛЕННЫЕ) ==========

@app.route('/api/send', methods=['POST'])
def send_message():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        data = request.get_json()
        chat_id = data.get('chat_id')
        chat_type = data.get('chat_type', 'private')
        text = data.get('text', '')
        file_path = data.get('file_path')
        
        if not chat_id:
            return jsonify({'error': 'chat_id обязателен'}), 400
        
        db = get_db()
        
        # Сохраняем сообщение с статусом 'sent'
        cursor = db.execute('''
            INSERT INTO messages (sender_id, chat_id, chat_type, text, file_path, status, is_read)
            VALUES (?, ?, ?, ?, ?, 'sent', 0)
        ''', (user_id, chat_id, chat_type, text, file_path))
        
        message_id = cursor.lastrowid
        
        # Для приватных чатов сохраняем зеркальное сообщение
        if chat_type == 'private' and chat_id.startswith('user_'):
            reverse_chat_id = f'user_{user_id}'
            db.execute('''
                INSERT INTO messages (sender_id, chat_id, chat_type, text, file_path, status, is_read)
                VALUES (?, ?, ?, ?, ?, 'sent', 0)
            ''', (user_id, reverse_chat_id, chat_type, text, file_path))
        
        db.commit()
        db.close()
        
        return jsonify({'status': 'ok', 'message_id': message_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        if 'file' not in request.files:
            return jsonify({'error': 'Нет файла'}), 400
        
        file = request.files['file']
        chat_id = request.form.get('chat_id')
        chat_type = request.form.get('chat_type', 'private')
        
        if file.filename == '':
            return jsonify({'error': 'Файл не выбран'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Недопустимый тип файла'}), 400
        
        filename = secure_filename(file.filename)
        unique_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        
        db = get_db()
        db.execute('''
            INSERT INTO messages (sender_id, chat_id, chat_type, text, file_path, status, is_read)
            VALUES (?, ?, ?, ?, ?, 'sent', 0)
        ''', (user_id, chat_id, chat_type, f"/uploads/{unique_name}", f"/uploads/{unique_name}"))
        
        if chat_type == 'private' and chat_id.startswith('user_'):
            reverse_chat_id = f'user_{user_id}'
            db.execute('''
                INSERT INTO messages (sender_id, chat_id, chat_type, text, file_path, status, is_read)
                VALUES (?, ?, ?, ?, ?, 'sent', 0)
            ''', (user_id, reverse_chat_id, chat_type, f"/uploads/{unique_name}", f"/uploads/{unique_name}"))
        
        db.commit()
        db.close()
        return jsonify({'status': 'ok', 'filepath': f"/uploads/{unique_name}"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/<chat_id>', methods=['GET'])
def get_messages(chat_id):
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        messages = db.execute('''
            SELECT m.id, m.sender_id, m.chat_id, m.chat_type, m.text, m.file_path, 
                   m.timestamp, m.status, m.is_read,
                   u.username, u.display_name, u.avatar,
                   (SELECT COUNT(*) FROM read_receipts WHERE message_id = m.id) as read_count
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ?
            ORDER BY m.timestamp ASC
        ''', (chat_id,)).fetchall()
        db.close()
        
        result = []
        for msg in messages:
            result.append({
                'id': msg['id'],
                'sender_id': msg['sender_id'],
                'chat_id': msg['chat_id'],
                'chat_type': msg['chat_type'],
                'text': msg['text'] or '',
                'file_path': msg['file_path'],
                'timestamp': msg['timestamp'],
                'username': msg['username'],
                'display_name': msg['display_name'],
                'avatar': msg['avatar'],
                'status': msg['status'] or 'sent',
                'is_read': bool(msg['is_read']),
                'read_count': msg['read_count'] or 0
            })
        
        return jsonify(result)
    except Exception as e:
        print(f"❌ Ошибка в get_messages: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ========== СТАТУСЫ И УДАЛЕНИЕ ==========

@app.route('/api/messages/<int:message_id>/read', methods=['POST'])
def mark_message_read(message_id):
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        
        # Добавляем запись о прочтении
        db.execute('''
            INSERT OR IGNORE INTO read_receipts (message_id, user_id)
            VALUES (?, ?)
        ''', (message_id, user_id))
        
        # Обновляем статус сообщения
        db.execute('''
            UPDATE messages SET 
                status = 'read',
                is_read = 1
            WHERE id = ?
        ''', (message_id,))
        
        db.commit()
        db.close()
        
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/<int:message_id>', methods=['DELETE'])
def delete_message_by_id(message_id):
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        
        msg = db.execute(
            'SELECT sender_id FROM messages WHERE id = ?',
            (message_id,)
        ).fetchone()
        
        if not msg:
            db.close()
            return jsonify({'error': 'Сообщение не найдено'}), 404
        
        if msg['sender_id'] != user_id:
            db.close()
            return jsonify({'error': 'Нельзя удалить чужое сообщение'}), 403
        
        db.execute('DELETE FROM messages WHERE id = ?', (message_id,))
        db.commit()
        db.close()
        
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========== ЧАТЫ ==========

@app.route('/api/chats', methods=['GET'])
def get_chats():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        
        # Получаем уникальных собеседников для личных чатов
        private_chats = db.execute('''
            SELECT DISTINCT 
                CASE 
                    WHEN m.sender_id = ? THEN 
                        (SELECT id FROM users WHERE id != ? AND id IN 
                            (SELECT sender_id FROM messages WHERE chat_type = 'private' AND sender_id != ?)
                        )
                    ELSE m.sender_id
                END as user_id
            FROM messages m
            WHERE m.chat_type = 'private' AND (m.sender_id = ? OR m.sender_id IN 
                (SELECT sender_id FROM messages WHERE chat_type = 'private')
            )
        ''', (user_id, user_id, user_id, user_id)).fetchall()
        
        private_result = []
        for row in private_chats:
            if row['user_id']:
                user = db.execute(
                    'SELECT id, username, display_name, avatar FROM users WHERE id = ?',
                    (row['user_id'],)
                ).fetchone()
                if user:
                    private_result.append(user)
        
        groups = db.execute('''
            SELECT g.id, g.name, g.created_by, g.avatar, u.username as creator, u.display_name as creator_display_name
            FROM groups g
            JOIN group_members gm ON g.id = gm.group_id
            JOIN users u ON g.created_by = u.id
            WHERE gm.user_id = ?
        ''', (user_id,)).fetchall()
        
        db.close()
        return jsonify({
            'private': [dict(p) for p in private_result],
            'groups': [dict(g) for g in groups]
        })
    except Exception as e:
        print(f"❌ Ошибка в get_chats: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ========== ГРУППЫ ==========

@app.route('/api/create_group', methods=['POST'])
def create_group():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        data = request.get_json()
        group_name = data.get('name')
        member_ids = data.get('members', [])
        
        db = get_db()
        cursor = db.execute(
            'INSERT INTO groups (name, created_by) VALUES (?, ?)',
            (group_name, user_id)
        )
        group_id = cursor.lastrowid
        
        db.execute(
            'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
            (group_id, user_id)
        )
        for uid in member_ids:
            db.execute(
                'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
                (group_id, uid)
            )
        db.commit()
        db.close()
        return jsonify({'group_id': group_id, 'group_name': group_name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group/<int:group_id>', methods=['GET'])
def get_group(group_id):
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        
        group = db.execute('''
            SELECT g.*, u.username as creator_username, u.display_name as creator_display_name, u.avatar as creator_avatar
            FROM groups g
            JOIN users u ON g.created_by = u.id
            WHERE g.id = ?
        ''', (group_id,)).fetchone()
        
        if not group:
            db.close()
            return jsonify({'error': 'Группа не найдена'}), 404
        
        is_member = db.execute(
            'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
            (group_id, user_id)
        ).fetchone()
        
        if not is_member:
            db.close()
            return jsonify({'error': 'Вы не состоите в этой группе'}), 403
        
        members = db.execute('''
            SELECT u.id, u.username, u.display_name, u.avatar
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = ?
        ''', (group_id,)).fetchall()
        
        db.close()
        
        return jsonify({
            'id': group['id'],
            'name': group['name'],
            'created_by': group['created_by'],
            'creator_username': group['creator_username'],
            'creator_display_name': group['creator_display_name'],
            'creator_avatar': group['creator_avatar'],
            'avatar': group['avatar'] if 'avatar' in group.keys() else None,
            'created_at': group['created_at'],
            'members': [dict(m) for m in members]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group/<int:group_id>/add_members', methods=['POST'])
def add_group_members(group_id):
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        data = request.get_json()
        new_member_ids = data.get('members', [])
        
        db = get_db()
        
        group = db.execute(
            'SELECT created_by FROM groups WHERE id = ?',
            (group_id,)
        ).fetchone()
        
        if not group:
            db.close()
            return jsonify({'error': 'Группа не найдена'}), 404
        
        if group['created_by'] != user_id:
            db.close()
            return jsonify({'error': 'Только создатель группы может добавлять участников'}), 403
        
        for uid in new_member_ids:
            db.execute(
                'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)',
                (group_id, uid)
            )
        
        db.commit()
        db.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group/<int:group_id>/leave', methods=['POST'])
def leave_group(group_id):
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        
        group = db.execute(
            'SELECT created_by FROM groups WHERE id = ?',
            (group_id,)
        ).fetchone()
        
        if not group:
            db.close()
            return jsonify({'error': 'Группа не найдена'}), 404
        
        if group['created_by'] == user_id:
            db.close()
            return jsonify({'error': 'Создатель не может покинуть группу'}), 403
        
        db.execute(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
            (group_id, user_id)
        )
        db.commit()
        db.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group/<int:group_id>/avatar', methods=['POST'])
def upload_group_avatar(group_id):
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        if 'avatar' not in request.files:
            return jsonify({'error': 'Нет файла'}), 400
        
        file = request.files['avatar']
        if file.filename == '':
            return jsonify({'error': 'Файл не выбран'}), 400
        
        db = get_db()
        group = db.execute(
            'SELECT created_by FROM groups WHERE id = ?',
            (group_id,)
        ).fetchone()
        
        if not group:
            db.close()
            return jsonify({'error': 'Группа не найдена'}), 404
        
        if group['created_by'] != user_id:
            db.close()
            return jsonify({'error': 'Только создатель группы может менять аватар'}), 403
        
        allowed = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        if ext not in allowed:
            return jsonify({'error': 'Недопустимый формат'}), 400
        
        filename = secure_filename(file.filename)
        unique_name = f"group_{group_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        
        try:
            db.execute(
                'UPDATE groups SET avatar = ? WHERE id = ?',
                (f"/uploads/{unique_name}", group_id)
            )
        except sqlite3.OperationalError:
            db.execute('ALTER TABLE groups ADD COLUMN avatar TEXT')
            db.execute(
                'UPDATE groups SET avatar = ? WHERE id = ?',
                (f"/uploads/{unique_name}", group_id)
            )
        
        db.commit()
        db.close()
        
        return jsonify({'status': 'ok', 'avatar': f"/uploads/{unique_name}"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)