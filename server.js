const mysql = require('mysql2');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;
const SECRET = 'your_secret_key'; // Заміни на надійний ключ у продакшені

app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const userId = req.user.id; // Assuming authMiddleware sets req.user
    cb(null, `profile-${userId}.webp`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Дозволені тільки зображення'), false);
    }
  }
});

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234', // пароль від mysql
  database: 'todo_bd2'
});

connection.connect((err) => {
  if (err) {
    console.error('Помилка підключення до MySQL:', err);
    return;
  }
  console.log('Підключено до MySQL!');
  
  // Створення таблиць для системи підписок
  createTables();
  
  // Додавання додаткових полів профілю користувача
  ensureUserProfileColumns();
});

// Створення необхідних таблиць
function createTables() {
  // Створення таблиці users
  connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      email VARCHAR(100) NULL,
      first_name VARCHAR(100) NULL,
      last_name VARCHAR(100) NULL,
      middle_name VARCHAR(100) NULL,
      photo VARCHAR(255) NULL,
      address VARCHAR(255) NULL,
      phone VARCHAR(50) NULL,
      location VARCHAR(100) NULL,
      subscription_level ENUM('basic', 'medium', 'premium') DEFAULT 'basic',
      subscription_expires DATETIME NULL,
      task_limit INT DEFAULT 5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.log('Помилка створення таблиці users:', err.message);
  });

  // Створення таблиці todos
  connection.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      user_id INT NOT NULL,
      completed TINYINT DEFAULT 0,
      difficulty ENUM('easy','medium','hard') DEFAULT 'easy',
      parent_id INT NULL,
      status VARCHAR(50) DEFAULT 'New',
      due_date DATETIME NULL,
      start_date DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES todos(id) ON DELETE SET NULL
    )
  `, (err) => {
    if (err) console.log('Помилка створення таблиці todos:', err.message);
  });

  // Оновлення таблиці users для додавання subscription_level (якщо потрібно)
  connection.query(`
    ALTER TABLE users 
    ADD COLUMN subscription_level ENUM('basic', 'medium', 'premium') DEFAULT 'basic'
  `, (err) => {
    if (err && !err.message.includes('Duplicate column name')) {
      console.log('Помилка додавання subscription_level:', err.message);
    }
  });

  connection.query(`
    ALTER TABLE users 
    ADD COLUMN subscription_expires DATETIME NULL
  `, (err) => {
    if (err && !err.message.includes('Duplicate column name')) {
      console.log('Помилка додавання subscription_expires:', err.message);
    }
  });

  connection.query(`
    ALTER TABLE users 
    ADD COLUMN task_limit INT DEFAULT 5
  `, (err) => {
    if (err && !err.message.includes('Duplicate column name')) {
      console.log('Помилка додавання task_limit:', err.message);
    }
  });

  // Додати поле складності для тасків
  connection.query(`
    ALTER TABLE todos 
    ADD COLUMN difficulty ENUM('easy','medium','hard') DEFAULT 'easy'
  `, (err) => {
    if (err && !err.message.includes('Duplicate column name')) {
      console.log('Помилка додавання difficulty:', err.message);
    }
  });

  // Дата створення та дата завершення таску
  connection.query(`
    ALTER TABLE todos 
    ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `, (err) => {
    if (err && !err.message.includes('Duplicate column name')) {
      console.log('Помилка додавання created_at:', err.message);
    }
    // Backfill created_at for існуючих записів без значення
    connection.query(`UPDATE todos SET created_at = NOW() WHERE created_at IS NULL`, () => {});
  });

  connection.query(`
    ALTER TABLE todos 
    ADD COLUMN completed_at DATETIME NULL
  `, (err) => {
    if (err && !err.message.includes('Duplicate column name')) {
      console.log('Помилка додавання completed_at:', err.message);
    }
    // Проставити приблизний completed_at для вже виконаних тасків без completed_at
    connection.query(`UPDATE todos SET completed_at = NOW() WHERE completed = 1 AND completed_at IS NULL`, () => {});
  });

  // Таблиця для логування дій
  connection.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      action VARCHAR(100),
      target_type VARCHAR(50),
      target_id INT,
      details JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) console.log('Помилка створення таблиці activity_logs:', err.message);
  });

  // Таблиця для коментарів/поправок від інших користувачів
  connection.query(`
    CREATE TABLE IF NOT EXISTS task_collaborations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT,
      author_id INT,
      type ENUM('comment', 'code_snippet', 'math_solution', 'edit'),
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) console.log('Помилка створення таблиці task_collaborations:', err.message);
  });

  // Таблиця для учасників завдань
  connection.query(`
    CREATE TABLE IF NOT EXISTS task_participants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT,
      user_id INT,
      role ENUM('Responsible', 'Observer', 'Co-executor', 'Manager') DEFAULT 'Observer',
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_task_user (task_id, user_id)
    )
  `, (err) => {
    if (err) console.log('Помилка створення таблиці task_participants:', err.message);
  });

  // Таблиця для сповіщень
  connection.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      type ENUM('assignment', 'status_change', 'new_comment', 'role_change'),
      message TEXT,
      related_task_id INT,
      is_read TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_task_id) REFERENCES todos(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.log('Помилка створення таблиці notifications:', err.message);
  });

  // Таблиця для адміністраторів
  connection.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE,
      password VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.log('Помилка створення таблиці admins:', err.message);
  });
}

// Додаткові поля користувача
function ensureUserProfileColumns() {
  const addCol = (col) => new Promise((resolve) => {
    connection.query(col, (err) => { resolve(); });
  });
  return Promise.all([
    addCol("ALTER TABLE users ADD COLUMN first_name VARCHAR(100) NULL"),
    addCol("ALTER TABLE users ADD COLUMN last_name VARCHAR(100) NULL"),
    addCol("ALTER TABLE users ADD COLUMN middle_name VARCHAR(100) NULL"),
    addCol("ALTER TABLE users ADD COLUMN photo VARCHAR(255) NULL"),
    addCol("ALTER TABLE users ADD COLUMN address VARCHAR(255) NULL"),
    addCol("ALTER TABLE users ADD COLUMN phone VARCHAR(50) NULL"),
    addCol("ALTER TABLE users ADD COLUMN location VARCHAR(100) NULL"),
  ]);
}

// Реєстрація (розширена)
app.post('/api/register', async (req, res) => {
  const { username, password, first_name, last_name, middle_name } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Введіть логін і пароль' });
  try {
    await ensureUserProfileColumns();
  } catch (e) {}
  connection.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length > 0) return res.status(400).json({ error: 'Користувач вже існує' });
    connection.query(
      'INSERT INTO users (username, password, first_name, last_name, middle_name) VALUES (?, ?, ?, ?, ?)',
      [username, password, first_name || null, last_name || null, middle_name || null],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true });
      }
    );
  });
});

// Логін
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Введіть логін і пароль' });
  connection.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ error: 'Невірний логін або пароль' });
  const user = results[0];
  const token = jwt.sign({ id: user.id, username: user.username, subscription_level: user.subscription_level, task_limit: user.task_limit, photo: user.photo || null }, SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, subscription_level: user.subscription_level, task_limit: user.task_limit, photo: user.photo || null });
  });
});

// Профіль користувача - отримати
app.get('/api/profile', authMiddleware, (req, res) => {
  const user_id = req.user.id;
  connection.query('SELECT id, username, email, first_name, last_name, middle_name, phone, location, subscription_level, task_limit, photo FROM users WHERE id = ?', [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = results[0];
    // If you have a photo column, replace the NULL above with `photo` in the SELECT
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      middle_name: user.middle_name,
      phone: user.phone,
      location: user.location,
      photo: user.photo || null,
      subscription_level: user.subscription_level,
      task_limit: user.task_limit
    });
  });
});

// Оновити профіль
app.put('/api/profile', authMiddleware, (req, res) => {
  const user_id = req.user.id;
  const allowed = ['first_name','last_name','email','middle_name','phone','location','photo','username'];
  const fields = [];
  const params = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      fields.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
  params.push(user_id);
  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  connection.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: result.affectedRows });
  });
});

// Змінити пароль
app.put('/api/profile/password', authMiddleware, (req, res) => {
  const user_id = req.user.id;
  const { new_password } = req.body;
  if (!new_password) return res.status(400).json({ error: 'New password required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'New password too short (min 6 chars)' });
  connection.query('UPDATE users SET password = ? WHERE id = ?', [new_password, user_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: result.affectedRows });
  });
});

// Маршрут для завантаження фото профілю
app.post('/api/profile/photo', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не був завантажений' });
    }

    const user_id = req.user.id;
    const photoPath = `/uploads/${req.file.filename}`;

    // Оновлюємо шлях до фото в базі даних
    connection.query(
      'UPDATE users SET photo = ? WHERE id = ?',
      [photoPath, user_id],
      (err, result) => {
        if (err) {
          // Видаляємо завантажений файл у разі помилки
          fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: err.message });
        }

        // Логуємо дію
        logActivity(user_id, 'update_profile_photo', 'user', user_id, { photo_path: photoPath });
        
        res.json({
          success: true,
          message: 'Фото профілю успішно оновлено',
          photo_url: photoPath
        });
      }
    );
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Помилка завантаження фото:', error);
    res.status(500).json({ error: 'Помилка сервера при завантаженні фото' });
  }
});

// Middleware для перевірки токена
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Немає токена' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Немає токена' });
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Невірний токен' });
    req.user = user;
    next();
  });
}

// Функція логування дій
function logActivity(userId, action, targetType, targetId, details = {}) {
  connection.query(
    'INSERT INTO activity_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, targetType, targetId, JSON.stringify(details)],
    (err) => {
      if (err) console.error('Помилка логування:', err);
    }
  );
}

// Функція створення сповіщень
function createNotification(userId, type, message, relatedTaskId) {
  connection.query(
    'INSERT INTO notifications (user_id, type, message, related_task_id) VALUES (?, ?, ?, ?)',
    [userId, type, message, relatedTaskId],
    (err) => {
      if (err) console.error('Помилка створення сповіщення:', err);
    }
  );
}

// Функція перевірки обмежень підписки
function checkSubscriptionLimits(userId, action, callback) {
  connection.query(
    'SELECT subscription_level, task_limit FROM users WHERE id = ?',
    [userId],
    (err, results) => {
      if (err) return callback(err, false);
      
      const user = results[0];
      if (!user) return callback(null, false);
      
      // Перевірка обмежень на кількість тасків
      if (action === 'create_task') {
        connection.query(
          'SELECT COUNT(*) as count FROM todos WHERE user_id = ?',
          [userId],
          (err, countResults) => {
            if (err) return callback(err, false);
            
            const currentCount = countResults[0].count;
            const limit = user.task_limit;
            
            if (currentCount >= limit) {
              return callback(null, false, `Досягнуто ліміт тасків (${limit}). Оновіть підписку для збільшення ліміту.`);
            }
            
            callback(null, true);
          }
        );
      } else {
        callback(null, true);
      }
    }
  );
}

// Функція отримання інформації про підписку
function getSubscriptionInfo(subscriptionLevel) {
  const subscriptions = {
    basic: {
      name: 'Базовий',
      price: 10,
      taskLimit: 5,
      canCollaborate: false,
      maxCollaborations: 0
    },
    medium: {
      name: 'Середній',
      price: 20,
      taskLimit: 10,
      canCollaborate: true,
      maxCollaborations: 3
    },
    premium: {
      name: 'Преміум',
      price: 100,
      taskLimit: 15,
      canCollaborate: true,
      maxCollaborations: -1 // безліміт
    }
  };
  
  return subscriptions[subscriptionLevel] || subscriptions.basic;
}

// CRUD API
// Отримати таски для поточного користувача (тільки власні)
app.get('/api/todos', authMiddleware, (req, res) => {
  const user_id = req.user.id;
  connection.query(`
    SELECT t.* FROM todos t
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC
  `, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Отримати спільні таски для поточного користувача (де він є учасником, але не власником)
app.get('/api/todos/shared', authMiddleware, (req, res) => {
  const user_id = req.user.id;
  connection.query(`
    SELECT t.*, u.username as owner_username, u.first_name as owner_first_name, u.last_name as owner_last_name, u.photo as owner_photo FROM todos t
    JOIN task_participants tp ON t.id = tp.task_id
    JOIN users u ON t.user_id = u.id
    WHERE tp.user_id = ? AND t.user_id != ?
    ORDER BY t.created_at DESC
  `, [user_id, user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Додаємо таск (тільки для авторизованих)
app.post('/api/todos', authMiddleware, (req, res) => {
  const { title, difficulty, parent_id, status, due_date, start_date } = req.body;
  const user_id = req.user.id;

  // Перевірка обмежень підписки
  checkSubscriptionLimits(user_id, 'create_task', (err, allowed, message) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!allowed) return res.status(403).json({ error: message });

    const diff = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'easy';
    const stat = status || 'New';
    connection.query('INSERT INTO todos (title, user_id, difficulty, parent_id, status, due_date, start_date) VALUES (?, ?, ?, ?, ?, ?, ?)', [title, user_id, diff, parent_id || null, stat, due_date || null, start_date || null], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      // Логування дії
      logActivity(user_id, 'create_task', 'todo', result.insertId, { title });

      res.json({ id: result.insertId, title, completed: 0, user_id, difficulty: diff, parent_id: parent_id || null, status: stat, due_date: due_date || null, start_date: start_date || null });
    });
  });
});

// Оновлення таску (власник або учасники з відповідними правами)
app.put('/api/todos/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { title, completed, difficulty, status } = req.body;
  const user_id = req.user.id;

  // Перевірити чи має право оновлювати
  connection.query(
    'SELECT user_id FROM todos WHERE id = ?',
    [id],
    (err, taskResults) => {
      if (err) return res.status(500).json({ error: err.message });
      if (taskResults.length === 0) return res.status(404).json({ error: 'Завдання не знайдено' });

      const taskOwnerId = taskResults[0].user_id;
      const isOwner = taskOwnerId === user_id;

      if (!isOwner) {
        // Перевірити чи є учасником з правами на редагування
        connection.query(
          'SELECT role FROM task_participants WHERE task_id = ? AND user_id = ?',
          [id, user_id],
          (err, participantResults) => {
            if (err) return res.status(500).json({ error: err.message });
            if (participantResults.length === 0) {
              return res.status(403).json({ error: 'Немає прав для редагування завдання' });
            }

            const role = participantResults[0].role;
            // Тільки Manager і Responsible можуть редагувати
            if (!['Manager', 'Responsible'].includes(role)) {
              return res.status(403).json({ error: 'Недостатньо прав для редагування завдання' });
            }

            updateTask();
          }
        );
      } else {
        updateTask();
      }

      function updateTask() {
        const setClauses = [];
        const params = [];

        if (typeof title !== 'undefined') { setClauses.push('title = ?'); params.push(title); }
        if (typeof completed !== 'undefined') { setClauses.push('completed = ?'); params.push(completed); setClauses.push('completed_at = CASE WHEN ? = 1 THEN NOW() ELSE NULL END'); params.push(completed); }
        if (typeof difficulty !== 'undefined' && ['easy','medium','hard'].includes(difficulty)) { setClauses.push('difficulty = ?'); params.push(difficulty); }
        if (typeof status !== 'undefined') { setClauses.push('status = ?'); params.push(status); }

        if (setClauses.length === 0) { return res.json({ updated: 0 }); }

        const sql = `UPDATE todos SET ${setClauses.join(', ')} WHERE id = ?`;
        params.push(id);

        connection.query(sql, params, (err, result) => {
          if (err) return res.status(500).json({ error: err.message });

          // Створити сповіщення про зміну статусу
          if (typeof status !== 'undefined' || typeof completed !== 'undefined') {
            const statusMessage = completed ? 'Завдання виконано' : `Статус змінено на: ${status || 'Невідомий'}`;

            // Сповіщення для власника, якщо не він змінював
            if (!isOwner) {
              createNotification(taskOwnerId, 'status_change', statusMessage, id);
            }

            // Сповіщення для всіх учасників
            connection.query(
              'SELECT user_id FROM task_participants WHERE task_id = ? AND user_id != ?',
              [id, user_id],
              (err, participants) => {
                if (!err && participants.length > 0) {
                  participants.forEach(participant => {
                    createNotification(participant.user_id, 'status_change', statusMessage, id);
                  });
                }
              }
            );
          }

          res.json({ updated: result.affectedRows });
        });
      }
    }
  );
});

// Видалення таску (тільки власник)
app.delete('/api/todos/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  connection.query('DELETE FROM todos WHERE id = ? AND user_id = ?', [id, user_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: result.affectedRows });
  });
});

// API для учасників завдань
// Отримати учасників завдання
app.get('/api/todos/:id/participants', authMiddleware, (req, res) => {
  const { id } = req.params;
  connection.query(`
    SELECT tp.*, u.username, u.first_name, u.last_name
    FROM task_participants tp
    JOIN users u ON tp.user_id = u.id
    WHERE tp.task_id = ?
    ORDER BY tp.assigned_at DESC
  `, [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Призначити учасника до завдання
app.post('/api/todos/:id/participants', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { user_id, role } = req.body;
  const assigner_id = req.user.id;

  // Перевірити чи існує завдання і чи є користувач власником або учасником
  connection.query(
    'SELECT user_id FROM todos WHERE id = ?',
    [id],
    (err, taskResults) => {
      if (err) return res.status(500).json({ error: err.message });
      if (taskResults.length === 0) return res.status(404).json({ error: 'Завдання не знайдено' });

      const taskOwnerId = taskResults[0].user_id;

      // Перевірити чи має право призначати (власник або менеджер)
      connection.query(
        'SELECT role FROM task_participants WHERE task_id = ? AND user_id = ?',
        [id, assigner_id],
        (err, participantResults) => {
          if (err) return res.status(500).json({ error: err.message });

          const isOwner = taskOwnerId === assigner_id;
          const isManager = participantResults.length > 0 && participantResults[0].role === 'Manager';

          if (!isOwner && !isManager) {
            return res.status(403).json({ error: 'Немає прав для призначення учасників' });
          }

          // Призначити учасника
          connection.query(
            'INSERT INTO task_participants (task_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
            [id, user_id, role],
            (err, result) => {
              if (err) return res.status(500).json({ error: err.message });

              // Створити сповіщення для нового учасника
              const roleNames = {
                'Responsible': 'Відповідальний',
                'Observer': 'Спостерігач',
                'Co-executor': 'Співвиконавець',
                'Manager': 'Керівник'
              };
              createNotification(
                user_id,
                'assignment',
                `Вас призначено до завдання як ${roleNames[role] || role}. <button onclick="window.openCollaborationMode(${id})">Співпраця</button>`,
                id
              );

              logActivity(assigner_id, 'assign_participant', 'todo', id, { assigned_user: user_id, role });
              res.json({ success: true, id: result.insertId });
            }
          );
        }
      );
    }
  );
});

// Видалити учасника з завдання
app.delete('/api/todos/:id/participants/:userId', authMiddleware, (req, res) => {
  const { id, userId } = req.params;
  const remover_id = req.user.id;

  // Перевірити чи має право видаляти
  connection.query(
    'SELECT user_id FROM todos WHERE id = ?',
    [id],
    (err, taskResults) => {
      if (err) return res.status(500).json({ error: err.message });
      if (taskResults.length === 0) return res.status(404).json({ error: 'Завдання не знайдено' });

      const taskOwnerId = taskResults[0].user_id;

      connection.query(
        'SELECT role FROM task_participants WHERE task_id = ? AND user_id = ?',
        [id, remover_id],
        (err, participantResults) => {
          if (err) return res.status(500).json({ error: err.message });

          const isOwner = taskOwnerId === remover_id;
          const isManager = participantResults.length > 0 && participantResults[0].role === 'Manager';

          if (!isOwner && !isManager) {
            return res.status(403).json({ error: 'Немає прав для видалення учасників' });
          }

          connection.query(
            'DELETE FROM task_participants WHERE task_id = ? AND user_id = ?',
            [id, userId],
            (err, result) => {
              if (err) return res.status(500).json({ error: err.message });

              // Створити сповіщення для видаленого учасника
              createNotification(
                userId,
                'assignment',
                'Вас видалено з учасників завдання',
                id
              );

              logActivity(remover_id, 'remove_participant', 'todo', id, { removed_user: userId });
              res.json({ success: true });
            }
          );
        }
      );
    }
  );
});

// API для підписок
app.get('/api/subscription/info', authMiddleware, (req, res) => {
  const user_id = req.user.id;
  connection.query(
    'SELECT subscription_level, task_limit FROM users WHERE id = ?',
    [user_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const user = results[0];
      const subscriptionInfo = getSubscriptionInfo(user.subscription_level);
      
      res.json({
        current: subscriptionInfo,
        taskLimit: user.task_limit,
        subscriptionLevel: user.subscription_level
      });
    }
  );
});

// Отримати всі доступні підписки
app.get('/api/subscription/plans', (req, res) => {
  const plans = {
    basic: getSubscriptionInfo('basic'),
    medium: getSubscriptionInfo('medium'),
    premium: getSubscriptionInfo('premium')
  };
  res.json(plans);
});

// API для співпраці (коментарі, поправки)
app.post('/api/todos/:id/collaborate', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { type, content } = req.body;
  const author_id = req.user.id;

  // Перевірка чи може користувач співпрацювати
  connection.query(
    'SELECT subscription_level FROM users WHERE id = ?',
    [author_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      const user = results[0];
      const subscriptionInfo = getSubscriptionInfo(user.subscription_level);

      if (!subscriptionInfo.canCollaborate) {
        return res.status(403).json({ error: 'Ваша підписка не дозволяє співпрацю' });
      }

      // Перевірка чи є користувач учасником завдання або власником
      connection.query(
        'SELECT user_id FROM todos WHERE id = ?',
        [id],
        (err, taskResults) => {
          if (err) return res.status(500).json({ error: err.message });
          if (taskResults.length === 0) return res.status(404).json({ error: 'Завдання не знайдено' });

          const taskOwnerId = taskResults[0].user_id;
          const isOwner = taskOwnerId === author_id;

          if (!isOwner) {
            // Перевірити чи є учасником
            connection.query(
              'SELECT id FROM task_participants WHERE task_id = ? AND user_id = ?',
              [id, author_id],
              (err, participantResults) => {
                if (err) return res.status(500).json({ error: err.message });
                if (participantResults.length === 0) {
                  return res.status(403).json({ error: 'Тільки учасники завдання можуть додавати коментарі' });
                }
                checkCollaborationLimits();
              }
            );
          } else {
            checkCollaborationLimits();
          }

          function checkCollaborationLimits() {
            // Перевірка ліміту співпраці для середнього рівня
            if (subscriptionInfo.maxCollaborations > 0) {
              connection.query(
                'SELECT COUNT(*) as count FROM task_collaborations WHERE author_id = ?',
                [author_id],
                (err, countResults) => {
                  if (err) return res.status(500).json({ error: err.message });

                  if (countResults[0].count >= subscriptionInfo.maxCollaborations) {
                    return res.status(403).json({ error: `Досягнуто ліміт співпраці (${subscriptionInfo.maxCollaborations})` });
                  }

                  addCollaboration();
                }
              );
            } else {
              addCollaboration();
            }
          }
        }
      );

      function addCollaboration() {
        connection.query(
          'INSERT INTO task_collaborations (task_id, author_id, type, content) VALUES (?, ?, ?, ?)',
          [id, author_id, type, content],
          (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            // Створити сповіщення для всіх учасників завдання
            connection.query(
              'SELECT user_id FROM task_participants WHERE task_id = ? AND user_id != ?',
              [id, author_id],
              (err, participants) => {
                if (!err && participants.length > 0) {
                  participants.forEach(participant => {
                    createNotification(
                      participant.user_id,
                      'new_comment',
                      'Новий коментар до завдання',
                      id
                    );
                  });
                }
              }
            );

            // Сповіщення для власника завдання, якщо коментар не від нього
            connection.query(
              'SELECT user_id FROM todos WHERE id = ?',
              [id],
              (err, taskResult) => {
                if (!err && taskResult.length > 0 && taskResult[0].user_id !== author_id) {
                  createNotification(
                    taskResult[0].user_id,
                    'new_comment',
                    'Новий коментар до вашого завдання',
                    id
                  );
                }
              }
            );

            logActivity(author_id, 'collaborate', 'todo', id, { type, content });
            res.json({ id: result.insertId, success: true });
          }
        );
      }
    }
  );
});

// Отримати співпрацю для таску
app.get('/api/todos/:id/collaborations', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  connection.query(`
    SELECT tc.*, u.username as author_name, u.id as author_id
    FROM task_collaborations tc
    JOIN users u ON tc.author_id = u.id
    WHERE tc.task_id = ?
    ORDER BY tc.created_at DESC
  `, [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Видалити коментар/співпрацю
app.delete('/api/collaborations/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  
  connection.query('DELETE FROM task_collaborations WHERE id = ? AND author_id = ?', [id, user_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(403).json({ error: 'Not authorized to delete this collaboration' });
    logActivity(user_id, 'delete_collaboration', 'collaboration', id);
    res.json({ message: 'Collaboration deleted' });
  });
});

// API для адміністратора
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  connection.query(
    'SELECT * FROM admins WHERE username = ? AND password = ?',
    [username, password],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(401).json({ error: 'Невірні дані адміністратора' });
      
      const admin = results[0];
      const token = jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '24h' });
      res.json({ token, username: admin.username });
    }
  );
});

// Оновити підписку користувача (тільки адмін)
app.put('/api/admin/users/:id/subscription', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { subscription_level, task_limit } = req.body;
  
  // Перевірка чи користувач адмін
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }
  
  connection.query(
    'UPDATE users SET subscription_level = ?, task_limit = ? WHERE id = ?',
    [subscription_level, task_limit, id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      logActivity(req.user.id, 'update_subscription', 'user', id, { subscription_level, task_limit });
      res.json({ success: true });
    }
  );
});

// Отримати статистику активності (тільки адмін)
app.get('/api/admin/activity', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }
  
  connection.query(`
    SELECT al.*, u.username 
    FROM activity_logs al 
    JOIN users u ON al.user_id = u.id 
    ORDER BY al.created_at DESC 
    LIMIT 100
  `, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Отримати агреговану статистику (тільки адмін)
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }

  const sql = `
    SELECT
      (SELECT COUNT(id) FROM users) AS total_users,
      (SELECT COUNT(id) FROM todos) AS total_tasks,
      (SELECT COUNT(id) FROM task_collaborations) AS total_collaborations
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      console.warn('[stats] SQL error:', err.message);
      return res.json({ total_users: 0, total_tasks: 0, total_collaborations: 0 });
    }
    const row = results[0] || {};
    res.json({
      total_users: Number(row.total_users || 0),
      total_tasks: Number(row.total_tasks || 0),
      total_collaborations: Number(row.total_collaborations || 0)
    });
  });
});

// Отримати список користувачів (тільки адмін)
app.get('/api/admin/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }
  
  connection.query(`
    SELECT id, username, subscription_level, task_limit
    FROM users 
    ORDER BY id DESC
  `, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Детальна статистика по користувачу (тільки адмін)
app.get('/api/admin/users/:id/stats', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }
  const userId = req.params.id;
  const sql = `
    SELECT
      (SELECT COUNT(id) FROM todos WHERE user_id = ?) AS tasks_count,
      (SELECT COUNT(id) FROM task_collaborations WHERE author_id = ?) AS comments_count
  `;
  connection.query(sql, [userId, userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const row = results[0] || {};
    res.json({
      tasks_count: Number(row.tasks_count || 0),
      comments_count: Number(row.comments_count || 0)
    });
  });
});

// Таски конкретного користувача (тільки адмін)
app.get('/api/admin/users/:id/todos', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }
  const userId = req.params.id;
  connection.query(`
    SELECT t.*,
           (SELECT COUNT(*) FROM todos WHERE parent_id = t.id) as subtask_count
    FROM todos t
    WHERE t.user_id = ?
    ORDER BY t.id DESC
  `, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Коментарі/співпраці конкретного користувача (тільки адмін)
app.get('/api/admin/users/:id/collaborations', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }
  const userId = req.params.id;
  connection.query(
    `SELECT tc.*, u.username as author_name 
     FROM task_collaborations tc 
     JOIN users u ON tc.author_id = u.id 
     WHERE tc.author_id = ?
     ORDER BY tc.created_at DESC`,
    [userId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// Перформанс користувача: виконані таски, середній час, % складних + серія для графіка
app.get('/api/admin/users/:id/performance', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }
  const userId = req.params.id;

  const q1 = `SELECT COUNT(*) AS completed_count FROM todos WHERE user_id = ? AND completed = 1`;
  const q2 = `SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, completed_at)) AS avg_minutes
              FROM todos WHERE user_id = ? AND completed = 1 AND created_at IS NOT NULL AND completed_at IS NOT NULL`;
  const q3 = `SELECT ROUND(100 * SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS hard_percent
              FROM todos WHERE user_id = ?`;
  const q4 = `SELECT DATE(completed_at) AS d, COUNT(*) AS c
              FROM todos
              WHERE user_id = ? AND completed = 1 AND completed_at IS NOT NULL AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
              GROUP BY DATE(completed_at)
              ORDER BY d`;

  connection.query(q1, [userId], (e1, r1) => {
    if (e1) return res.status(500).json({ error: e1.message });
    connection.query(q2, [userId], (e2, r2) => {
      if (e2) return res.status(500).json({ error: e2.message });
      connection.query(q3, [userId], (e3, r3) => {
        if (e3) return res.status(500).json({ error: e3.message });
        connection.query(q4, [userId], (e4, r4) => {
          if (e4) return res.status(500).json({ error: e4.message });
          res.json({
            completed_count: Number((r1[0] && r1[0].completed_count) || 0),
            avg_minutes: Number((r2[0] && r2[0].avg_minutes) || 0),
            hard_percent: Number((r3[0] && r3[0].hard_percent) || 0),
            series: (r4 || []).map(row => ({ date: row.d, count: row.c }))
          });
        });
      });
    });
  });
});

// Видалити користувача (тільки адмін) з пов'язаними даними
app.delete('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }

  const userId = req.params.id;

  // Почати транзакцію
  connection.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: err.message });

    // Видалити співпраці користувача
    connection.query('DELETE FROM task_collaborations WHERE author_id = ?', [userId], (err) => {
      if (err) return connection.rollback(() => res.status(500).json({ error: err.message }));

      // Видалити todos користувача (каскадно видалить collaborations по FK ON DELETE CASCADE якщо налаштовано)
      connection.query('DELETE FROM todos WHERE user_id = ?', [userId], (err) => {
        if (err) return connection.rollback(() => res.status(500).json({ error: err.message }));

        // Видалити activity лог користувача
        connection.query('DELETE FROM activity_logs WHERE user_id = ?', [userId], (err) => {
          if (err) return connection.rollback(() => res.status(500).json({ error: err.message }));

          // Нарешті видалити самого користувача
          connection.query('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
            if (err) return connection.rollback(() => res.status(500).json({ error: err.message }));

            connection.commit((err) => {
              if (err) return connection.rollback(() => res.status(500).json({ error: err.message }));
              logActivity(req.user.id, 'delete_user', 'user', userId);
              res.json({ success: true, deleted: result.affectedRows });
            });
          });
        });
      });
    });
  });
});

// Оновити підписку користувача (сам користувач)
app.put('/api/subscription/upgrade', authMiddleware, (req, res) => {
  const user_id = req.user.id;
  const { subscription_level } = req.body;
  
  const limits = { basic: 5, medium: 10, premium: 15 };
  const task_limit = limits[subscription_level] || 5;
  
  connection.query(
    'UPDATE users SET subscription_level = ?, task_limit = ? WHERE id = ?',
    [subscription_level, task_limit, user_id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      logActivity(user_id, 'upgrade_subscription', 'user', user_id, { subscription_level, task_limit });
      res.json({ success: true, subscription_level, task_limit });
    }
  );
});

// API для сповіщень
// Отримати сповіщення користувача
app.get('/api/notifications', authMiddleware, (req, res) => {
  const user_id = req.user.id;
  connection.query(`
    SELECT n.*, t.title as task_title
    FROM notifications n
    LEFT JOIN todos t ON n.related_task_id = t.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Позначити сповіщення як прочитане
app.put('/api/notifications/:id/read', authMiddleware, (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  connection.query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, user_id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: result.affectedRows });
    }
  );
});

// Отримати список всіх користувачів (для призначення учасників)
app.get('/api/users', authMiddleware, (req, res) => {
  connection.query(
    'SELECT id, username, first_name, last_name FROM users ORDER BY username',
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
});
