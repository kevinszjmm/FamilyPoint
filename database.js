const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'family-points.db');

let db = null;

// 密码加密
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'family-points-salt').digest('hex');
}

// 初始化数据库
async function initDatabase() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  // 用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      family_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 家庭成员表（增加 user_id）
  db.run(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 任务表（增加 user_id）
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      points INTEGER NOT NULL,
      category TEXT DEFAULT '日常',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 完成记录表（增加 user_id）
  db.run(`
    CREATE TABLE IF NOT EXISTS completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      completed_at DATE NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);

  // 会话表（用于保持登录状态）
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 积分兑换物品表
  db.run(`
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      points_cost INTEGER NOT NULL,
      description TEXT,
      stock INTEGER DEFAULT -1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 兑换记录表
  db.run(`
    CREATE TABLE IF NOT EXISTS redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      reward_id INTEGER NOT NULL,
      points_spent INTEGER NOT NULL,
      redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (reward_id) REFERENCES rewards(id)
    )
  `);

  saveDb();
  console.log('✅ 数据库初始化完成');
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// 用户操作
const userOps = {
  register(username, password, familyName) {
    const hashedPassword = hashPassword(password);
    try {
      db.run(
        'INSERT INTO users (username, password, family_name) VALUES (?, ?, ?)',
        [username, hashedPassword, familyName]
      );
      saveDb();
      const result = db.exec('SELECT last_insert_rowid() as id');
      return { success: true, userId: result[0].values[0][0] };
    } catch (e) {
      return { success: false, error: '用户名已存在' };
    }
  },

  login(username, password) {
    const hashedPassword = hashPassword(password);
    const result = db.exec(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [username, hashedPassword]
    );
    
    if (!result.length || !result[0].values.length) {
      return { success: false, error: '用户名或密码错误' };
    }
    
    const user = result[0].values[0];
    const userId = user[0];
    
    // 生成登录令牌
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30天
    
    db.run(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, token, expiresAt]
    );
    saveDb();
    
    return {
      success: true,
      token,
      user: {
        id: userId,
        username: user[1],
        familyName: user[3]
      }
    };
  },

  getByToken(token) {
    const result = db.exec(`
      SELECT u.id, u.username, u.family_name 
      FROM users u 
      JOIN sessions s ON u.id = s.user_id 
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `, [token]);
    
    if (!result.length || !result[0].values.length) {
      return null;
    }
    
    const row = result[0].values[0];
    return { id: row[0], username: row[1], familyName: row[2] };
  },

  logout(token) {
    db.run('DELETE FROM sessions WHERE token = ?', [token]);
    saveDb();
  }
};

// 成员操作（增加 userId 参数）
const memberOps = {
  add(userId, name, avatar = null) {
    db.run(
      'INSERT INTO members (user_id, name, avatar) VALUES (?, ?, ?)',
      [userId, name, avatar]
    );
    saveDb();
    const result = db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  },

  getAll(userId) {
    const result = db.exec(
      'SELECT * FROM members WHERE user_id = ? ORDER BY id',
      [userId]
    );
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0],
      user_id: row[1],
      name: row[2],
      avatar: row[3],
      created_at: row[4]
    }));
  },

  getById(id, userId) {
    const result = db.exec(
      'SELECT * FROM members WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!result.length || !result[0].values.length) return null;
    const row = result[0].values[0];
    return { id: row[0], user_id: row[1], name: row[2], avatar: row[3], created_at: row[4] };
  },

  update(id, userId, name, avatar) {
    db.run(
      'UPDATE members SET name = ?, avatar = ? WHERE id = ? AND user_id = ?',
      [name, avatar, id, userId]
    );
    saveDb();
  },

  delete(id, userId) {
    db.run('DELETE FROM members WHERE id = ? AND user_id = ?', [id, userId]);
    saveDb();
  }
};

// 任务操作
const taskOps = {
  add(userId, name, points, category = '日常', description = '') {
    db.run(
      'INSERT INTO tasks (user_id, name, points, category, description) VALUES (?, ?, ?, ?, ?)',
      [userId, name, points, category, description]
    );
    saveDb();
    const result = db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  },

  getAll(userId) {
    const result = db.exec(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY category, points DESC',
      [userId]
    );
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0],
      user_id: row[1],
      name: row[2],
      points: row[3],
      category: row[4],
      description: row[5],
      created_at: row[6]
    }));
  },

  getById(id, userId) {
    const result = db.exec(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!result.length || !result[0].values.length) return null;
    const row = result[0].values[0];
    return { id: row[0], user_id: row[1], name: row[2], points: row[3], category: row[4], description: row[5], created_at: row[6] };
  },

  update(id, userId, name, points, category, description) {
    db.run(
      'UPDATE tasks SET name = ?, points = ?, category = ?, description = ? WHERE id = ? AND user_id = ?',
      [name, points, category, description, id, userId]
    );
    saveDb();
  },

  delete(id, userId) {
    db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
    saveDb();
  }
};

// 完成记录操作
const completionOps = {
  add(userId, memberId, taskId, date = null, note = '') {
    const task = taskOps.getById(taskId, userId);
    if (!task) throw new Error('任务不存在');
    
    const completedAt = date || new Date().toISOString().split('T')[0];
    db.run(`
      INSERT INTO completions (user_id, member_id, task_id, points, completed_at, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, memberId, taskId, task.points, completedAt, note]);
    saveDb();
    const result = db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  },

  getByDate(userId, date) {
    const result = db.exec(`
      SELECT c.id, c.member_id, c.task_id, c.points, c.completed_at, c.note,
             m.name as member_name, t.name as task_name, t.category
      FROM completions c
      JOIN members m ON c.member_id = m.id
      JOIN tasks t ON c.task_id = t.id
      WHERE c.user_id = ? AND c.completed_at = ?
      ORDER BY c.id DESC
    `, [userId, date]);
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0], member_id: row[1], task_id: row[2], points: row[3],
      completed_at: row[4], note: row[5], member_name: row[6], task_name: row[7], category: row[8]
    }));
  },

  getByMember(userId, memberId) {
    const result = db.exec(`
      SELECT c.id, c.task_id, c.points, c.completed_at, c.note, t.name as task_name, t.category
      FROM completions c
      JOIN tasks t ON c.task_id = t.id
      WHERE c.user_id = ? AND c.member_id = ?
      ORDER BY c.completed_at DESC
    `, [userId, memberId]);
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0], task_id: row[1], points: row[2], completed_at: row[3], note: row[4], task_name: row[5], category: row[6]
    }));
  },

  getByDateRange(userId, startDate, endDate) {
    const result = db.exec(`
      SELECT c.id, c.member_id, c.task_id, c.points, c.completed_at, c.note,
             m.name as member_name, t.name as task_name, t.category
      FROM completions c
      JOIN members m ON c.member_id = m.id
      JOIN tasks t ON c.task_id = t.id
      WHERE c.user_id = ? AND c.completed_at BETWEEN ? AND ?
      ORDER BY c.completed_at DESC, c.id DESC
    `, [userId, startDate, endDate]);
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0], member_id: row[1], task_id: row[2], points: row[3],
      completed_at: row[4], note: row[5], member_name: row[6], task_name: row[7], category: row[8]
    }));
  },

  delete(id, userId) {
    db.run('DELETE FROM completions WHERE id = ? AND user_id = ?', [id, userId]);
    saveDb();
  }
};

// 统计操作
const statsOps = {
  getTotalPoints(userId) {
    const result = db.exec(`
      SELECT m.id, m.name, m.avatar, COALESCE(SUM(c.points), 0) as total_points
      FROM members m
      LEFT JOIN completions c ON m.id = c.member_id
      WHERE m.user_id = ?
      GROUP BY m.id
      ORDER BY total_points DESC
    `, [userId]);
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0], name: row[1], avatar: row[2], total_points: row[3]
    }));
  },

  getPointsByRange(userId, startDate, endDate) {
    const result = db.exec(`
      SELECT m.id, m.name, m.avatar, COALESCE(SUM(c.points), 0) as total_points
      FROM members m
      LEFT JOIN completions c ON m.id = c.member_id AND c.completed_at BETWEEN ? AND ?
      WHERE m.user_id = ?
      GROUP BY m.id
      ORDER BY total_points DESC
    `, [startDate, endDate, userId]);
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0], name: row[1], avatar: row[2], total_points: row[3]
    }));
  },

  getWeeklyRanking(userId) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const startDate = monday.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];
    
    return {
      startDate,
      endDate,
      ranking: this.getPointsByRange(userId, startDate, endDate)
    };
  },

  getLastWeekRanking(userId) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    const startDate = lastMonday.toISOString().split('T')[0];
    const endDate = lastSunday.toISOString().split('T')[0];
    
    return {
      startDate,
      endDate,
      ranking: this.getPointsByRange(userId, startDate, endDate)
    };
  },

  getMemberDailyStats(userId, memberId, days = 30) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const result = db.exec(`
      SELECT completed_at as date, SUM(points) as points
      FROM completions
      WHERE user_id = ? AND member_id = ? AND completed_at BETWEEN ? AND ?
      GROUP BY completed_at
      ORDER BY completed_at
    `, [userId, memberId, startDate, endDate]);
    if (!result.length) return [];
    return result[0].values.map(row => ({ date: row[0], points: row[1] }));
  }
};

// 积分兑换操作
const rewardOps = {
  add(userId, name, pointsCost, description = '', stock = -1) {
    db.run(
      'INSERT INTO rewards (user_id, name, points_cost, description, stock) VALUES (?, ?, ?, ?, ?)',
      [userId, name, pointsCost, description, stock]
    );
    saveDb();
    const result = db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  },

  getAll(userId) {
    const result = db.exec(
      'SELECT * FROM rewards WHERE user_id = ? ORDER BY points_cost',
      [userId]
    );
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0], user_id: row[1], name: row[2], points_cost: row[3],
      description: row[4], stock: row[5], created_at: row[6]
    }));
  },

  update(id, userId, name, pointsCost, description, stock) {
    db.run(
      'UPDATE rewards SET name = ?, points_cost = ?, description = ?, stock = ? WHERE id = ? AND user_id = ?',
      [name, pointsCost, description, stock, id, userId]
    );
    saveDb();
  },

  delete(id, userId) {
    db.run('DELETE FROM rewards WHERE id = ? AND user_id = ?', [id, userId]);
    saveDb();
  },

  getById(id, userId) {
    const result = db.exec(
      'SELECT * FROM rewards WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!result.length || !result[0].values.length) return null;
    const row = result[0].values[0];
    return {
      id: row[0], user_id: row[1], name: row[2], points_cost: row[3],
      description: row[4], stock: row[5], created_at: row[6]
    };
  }
};

// 兑换记录操作
const redemptionOps = {
  redeem(userId, memberId, rewardId) {
    const reward = rewardOps.getById(rewardId, userId);
    if (!reward) throw new Error('奖励不存在');
    if (reward.stock === 0) throw new Error('库存不足');
    
    const member = memberOps.getById(memberId, userId);
    if (!member) throw new Error('成员不存在');
    
    const totalPoints = statsOps.getTotalPoints(userId).find(m => m.id === memberId);
    if (totalPoints.total_points < reward.points_cost) {
      throw new Error('积分不足');
    }
    
    db.run(`
      INSERT INTO redemptions (user_id, member_id, reward_id, points_spent)
      VALUES (?, ?, ?, ?)
    `, [userId, memberId, rewardId, reward.points_cost]);
    
    if (reward.stock > 0) {
      db.run('UPDATE rewards SET stock = stock - 1 WHERE id = ?', [rewardId]);
    }
    saveDb();
    
    const result = db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  },

  getByMember(userId, memberId) {
    const result = db.exec(`
      SELECT r.id, r.reward_id, r.points_spent, r.redeemed_at,
             rw.name as reward_name, rw.points_cost
      FROM redemptions r
      JOIN rewards rw ON r.reward_id = rw.id
      WHERE r.user_id = ? AND r.member_id = ?
      ORDER BY r.redeemed_at DESC
    `, [userId, memberId]);
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0], reward_id: row[1], points_spent: row[2],
      redeemed_at: row[3], reward_name: row[4], points_cost: row[5]
    }));
  },

  getAll(userId) {
    const result = db.exec(`
      SELECT r.id, r.member_id, r.reward_id, r.points_spent, r.redeemed_at,
             m.name as member_name, rw.name as reward_name
      FROM redemptions r
      JOIN members m ON r.member_id = m.id
      JOIN rewards rw ON r.reward_id = rw.id
      WHERE r.user_id = ?
      ORDER BY r.redeemed_at DESC
    `, [userId]);
    if (!result.length) return [];
    return result[0].values.map(row => ({
      id: row[0], member_id: row[1], reward_id: row[2], points_spent: row[3],
      redeemed_at: row[4], member_name: row[5], reward_name: row[6]
    }));
  }
};

module.exports = {
  initDatabase,
  userOps,
  memberOps,
  taskOps,
  completionOps,
  statsOps,
  rewardOps,
  redemptionOps
};