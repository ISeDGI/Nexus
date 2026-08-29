import sqlite3

conn = sqlite3.connect('database/data_source.db')
cursor = conn.cursor()

# Создаём таблицу для сообщений
cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
''')

conn.commit()
conn.close()
print("✅ Таблица messages создана!")