import sqlite3
import os

# Создаем папку database если её нет
os.makedirs('database', exist_ok=True)

# Подключаемся к базе данных
conn = sqlite3.connect('database/data_source.db')
cursor = conn.cursor()

# Создаем таблицу пользователей
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

# Создаем таблицу сообщений
cursor.execute('''
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL,
    chat_type TEXT NOT NULL,
    text TEXT,
    file_path TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users (id)
)
''')

# Создаем таблицу групповых чатов
cursor.execute('''
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users (id)
)
''')

# Создаем таблицу участников групп
cursor.execute('''
CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
)
''')

# Сохраняем изменения и закрываем
conn.commit()
conn.close()

print("✅ База данных создана!")
print("📁 Путь: database/data_source.db")
print("📋 Таблицы: users, messages, groups, group_members")