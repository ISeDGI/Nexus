from flask import Flask, render_template, request, jsonify, session
import sqlite3
import hashlib
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

def get_db():
    conn = sqlite3.connect('database/data_source.db')
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

@app.route('/')
def index():
    return render_template('login.html')

@app.route('/api/register', methods=['POST'])
def register():
    print("Регистрация: начата")
    try:
        data = request.get_json()
        print("Данные:", data)
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
        print("Регистрация: успешно")
        return jsonify({'status': 'ok'})
    except Exception as e:
        print("Регистрация: ОШИБКА:", str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    print("Вход: начат")
    try:
        data = request.get_json()
        print("Данные:", data)
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
        print("Вход: успешно для", username)
        return jsonify({'status': 'ok'})
    except Exception as e:
        print("Вход: ОШИБКА:", str(e))
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)