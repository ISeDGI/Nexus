from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import sqlite3
import hashlib
import secrets
import os

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

def get_db():
    db_path = os.path.join(os.path.dirname(__file__), 'database', 'data_source.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

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
            'SELECT id, username, display_name FROM users WHERE username LIKE ? AND id != ?',
            (f'%{search}%', user_id)
        ).fetchall()
        db.close()
        return jsonify([dict(u) for u in users])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ ПРОФИЛЬ ============

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

# ============ СООБЩЕНИЯ ============

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
        
        if not chat_id:
            return jsonify({'error': 'chat_id обязателен'}), 400
        
        print(f"📨 Сообщение: от {user_id}, в чат {chat_id}, текст: {text}")
        
        db = get_db()
        
        # Сохраняем в оба чата
        db.execute(
            'INSERT INTO messages (sender_id, chat_id, chat_type, text) VALUES (?, ?, ?, ?)',
            (user_id, chat_id, chat_type, text)
        )
        
        if chat_type == 'private' and chat_id.startswith('user_'):
            reverse_chat_id = f'user_{user_id}'
            db.execute(
                'INSERT INTO messages (sender_id, chat_id, chat_type, text) VALUES (?, ?, ?, ?)',
                (user_id, reverse_chat_id, chat_type, text)
            )
            print(f"📨 Копия сохранена в чат: {reverse_chat_id}")
        
        db.commit()
        db.close()
        print("✅ Сообщение сохранено")
        return jsonify({'status': 'ok'})
    except Exception as e:
        print(f"❌ Ошибка: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/<chat_id>', methods=['GET'])
def get_messages(chat_id):
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        messages = db.execute('''
            SELECT m.*, u.username, u.display_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ?
            ORDER BY m.timestamp ASC
        ''', (chat_id,)).fetchall()
        db.close()
        return jsonify([dict(m) for m in messages])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats', methods=['GET'])
def get_chats():
    try:
        user_id = request.args.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        
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
                    'SELECT id, username, display_name FROM users WHERE id = ?',
                    (row['user_id'],)
                ).fetchone()
                if user:
                    private_result.append(user)
        
        groups = db.execute('''
            SELECT g.id, g.name, g.created_by, u.username as creator
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
        print(f"❌ Ошибка в /api/chats: {str(e)}")
        return jsonify({'error': str(e)}), 500

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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)