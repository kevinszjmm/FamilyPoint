const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 统一配置
const USE_PG = !!process.env.DATABASE_URL;
const DB_PATH = path.join(__dirname, 'family-points.db');

let db = null;        // sql.js instance
let pgPool = null;    // PostgreSQL pool

// ============================================================
// PostgreSQL 初始化
// ============================================================
async function initPg() {
  const { Pool } = require('pg');
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  
  // 创建表
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(128) NOT NULL,
      family_name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      avatar VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      points INTEGER NOT NULL DEFAULT 10,
      category VARCHAR(20) DEFAULT '日常',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS completions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      completed_at DATE NOT NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(128) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS rewards (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      points_cost INTEGER NOT NULL,
      description TEXT,
      stock INTEGER DEFAULT -1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS redemptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      reward_id INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
      points_spent INTEGER NOT NULL,
      redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建索引
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_completions_user ON completions(user_id)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_completions_member ON completions(member_id)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(completed_at)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_rewards_user ON rewards(user_id)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_id)`);
  
  console.log('✅ PostgreSQL 数据库初始化完成');
}

// ============================================================
// sql.js 初始化（本地模式）
// ============================================================
async function initSqljs() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      family_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 10,
      category TEXT DEFAULT '日常',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
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
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
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
      FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE SET NULL
    )
  `);
  
  saveDb();
  console.log('✅ sql.js 数据库初始化完成');
}

// ============================================================
// 数据库迁移（自动补充缺失的列）
// ============================================================
function migrateSqljs() {
  // 获取所有表
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (!tables.length) return;
  
  const tableNames = tables[0].values.map(r => r[0]);
  
  // 需要检查的列迁移
  const migrations = {
    users: [
      { column: 'last_login_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
    ],
    sessions: [
      { column: 'last_active_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
    ]
  };
  
  for (const [table, columns] of Object.entries(migrations)) {
    if (!tableNames.includes(table)) continue;
    
    // 获取当前表的列信息
    const tableInfo = db.exec(`PRAGMA table_info(${table})`);
    if (!tableInfo.length) continue;
    
    const existingColumns = tableInfo[0].values.map(r => r[1]);
    
    for (const col of columns) {
      if (!existingColumns.includes(col.column)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${col.column} ${col.type}`);
        console.log(`  🔄 迁移: ${table} 添加列 ${col.column}`);
      }
    }
  }
  
  saveDb();
}

// 统一初始化入口
async function initDatabase() {
  if (USE_PG) {
    await initPg();
  } else {
    await initSqljs();
    migrateSqljs();
  }
}

// ============================================================
// sql.js 工具函数
// ============================================================
function saveDb() {
  if (!USE_PG && db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function query(sql, params = []) {
  if (USE_PG) return pgPool.query(sql, params);
  
  // sql.js 不支持 $1, $2 语法，需要转换为 ?
  let sqliteSQL = sql.replace(/\$\d+/g, '?');
  const stmt = db.prepare(sqliteSQL);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return { rows, command: sql };
}

function run(sql, params = []) {
  if (USE_PG) return pgPool.query(sql, params);
  
  // sql.js 不支持 $1, $2 语法，需要转换为 ?
  let sqliteSQL = sql.replace(/\$\d+/g, '?');
  db.run(sqliteSQL, params);
  saveDb();
  
  // sql.js 的 last_insert_rowid() 有时返回 0，需要特殊处理
  const lastId = db.exec('SELECT last_insert_rowid() as id');
  const id = lastId[0]?.values[0]?.[0];
  
  return { lastInsertRowid: id || 1 };
}

// ============================================================
// 密码加密
// ============================================================
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'family-points-salt').digest('hex');
}

// ============================================================
// 用户操作
// ============================================================
const userOps = {
  register(username, password, familyName) {
    const hashedPassword = hashPassword(password);
    try {
      const result = run(
        'INSERT INTO users (username, password, family_name) VALUES ($1, $2, $3)',
        [username, hashedPassword, familyName]
      );
      return { success: true, userId: USE_PG ? result.rows[0].id : result.lastInsertRowid };
    } catch (e) {
      return { success: false, error: '用户名已存在' };
    }
  },

  login(username, password) {
    const hashedPassword = hashPassword(password);
    const result = query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, hashedPassword]
    );
    
    if (!result.rows.length) {
      return { success: false, error: '用户名或密码错误' };
    }
    
    const user = USE_PG ? result.rows[0] : result.rows[0];
    const userId = user.id;
    
    // 生成登录令牌（7天有效期）
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    run(
      'INSERT INTO sessions (user_id, token, expires_at, last_active_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [userId, token, expiresAt]
    );
    
    // 更新最后登录时间
    run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
    
    return {
      success: true,
      token,
      expiresAt,
      user: { id: userId, username: user.username, familyName: user.family_name }
    };
  },

  getByToken(token) {
    // 查询 session 并更新最后活跃时间
    let result;
    if (USE_PG) {
      result = query(`
        SELECT u.id, u.username, u.family_name, s.created_at as session_created
        FROM users u 
        JOIN sessions s ON u.id = s.user_id 
        WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP
          AND s.last_active_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      `, [token]);
      
      if (result.rows.length) {
        // 更新最后活跃时间
        pgPool.query('UPDATE sessions SET last_active_at = CURRENT_TIMESTAMP WHERE token = $1', [token]);
        return { id: result.rows[0].id, username: result.rows[0].username, familyName: result.rows[0].family_name };
      }
    } else {
      result = query(`
        SELECT u.id, u.username, u.family_name, s.created_at as session_created
        FROM users u 
        JOIN sessions s ON u.id = s.user_id 
        WHERE s.token = ? AND s.expires_at > datetime('now')
          AND s.last_active_at > datetime('now', '-7 days')
      `, [token]);
      
      if (result.rows.length) {
        run('UPDATE sessions SET last_active_at = datetime("now") WHERE token = ?', [token]);
        const row = result.rows[0];
        return { id: row.id, username: row.username, familyName: row.family_name };
      }
    }
    return null;
  },

  logout(token) {
    run('DELETE FROM sessions WHERE token = $1', [token]);
  }
};

// ============================================================
// 成员操作
// ============================================================
const memberOps = {
  add(userId, name, avatar = null) {
    const result = run(
      'INSERT INTO members (user_id, name, avatar) VALUES ($1, $2, $3)',
      [userId, name, avatar]
    );
    return { lastInsertRowid: USE_PG ? result.rows[0].id : result.lastInsertRowid };
  },

  getAll(userId) {
    const result = query(
      'SELECT * FROM members WHERE user_id = $1 ORDER BY id',
      [userId]
    );
    return result.rows.map(row => ({
      id: row.id, user_id: row.user_id, name: row.name, avatar: row.avatar, created_at: row.created_at
    }));
  },

  getById(id, userId) {
    const result = query(
      'SELECT * FROM members WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return { id: row.id, user_id: row.user_id, name: row.name, avatar: row.avatar, created_at: row.created_at };
  },

  update(id, userId, name, avatar) {
    run(
      'UPDATE members SET name = $1, avatar = $2 WHERE id = $3 AND user_id = $4',
      [name, avatar, id, userId]
    );
  },

  delete(id, userId) {
    run('DELETE FROM members WHERE id = $1 AND user_id = $2', [id, userId]);
  }
};

// ============================================================
// 任务操作
// ============================================================
const taskOps = {
  add(userId, name, points, category = '日常', description = '') {
    const result = run(
      'INSERT INTO tasks (user_id, name, points, category, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, name, points, category, description]
    );
    return { lastInsertRowid: USE_PG ? result.rows[0].id : result.lastInsertRowid };
  },

  getAll(userId) {
    const result = query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY category, points DESC',
      [userId]
    );
    return result.rows.map(row => ({
      id: row.id, user_id: row.user_id, name: row.name, points: row.points,
      category: row.category, description: row.description, created_at: row.created_at
    }));
  },

  getById(id, userId) {
    const result = query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return { id: row.id, user_id: row.user_id, name: row.name, points: row.points,
      category: row.category, description: row.description, created_at: row.created_at };
  },

  update(id, userId, name, points, category, description) {
    run(
      'UPDATE tasks SET name = $1, points = $2, category = $3, description = $4 WHERE id = $5 AND user_id = $6',
      [name, points, category, description, id, userId]
    );
  },

  delete(id, userId) {
    run('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
  }
};

// ============================================================
// 完成记录操作
// ============================================================
const completionOps = {
  add(userId, memberId, taskId, date = null, note = '') {
    const task = taskOps.getById(taskId, userId);
    if (!task) throw new Error('任务不存在');
    const completedAt = date || new Date().toISOString().split('T')[0];
    const result = run(
      'INSERT INTO completions (user_id, member_id, task_id, points, completed_at, note) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, memberId, taskId, task.points, completedAt, note]
    );
    return { lastInsertRowid: USE_PG ? result.rows[0].id : result.lastInsertRowid };
  },

  getByDate(userId, date) {
    const result = query(`
      SELECT c.id, c.member_id, c.task_id, c.points, c.completed_at, c.note,
             m.name as member_name, t.name as task_name, t.category
      FROM completions c
      JOIN members m ON c.member_id = m.id
      JOIN tasks t ON c.task_id = t.id
      WHERE c.user_id = $1 AND c.completed_at = $2
      ORDER BY c.id DESC
    `, [userId, date]);
    return result.rows.map(row => ({
      id: row.id, member_id: row.member_id, task_id: row.task_id, points: row.points,
      completed_at: row.completed_at, note: row.note, member_name: row.member_name,
      task_name: row.task_name, category: row.category
    }));
  },

  getByMember(userId, memberId) {
    const result = query(`
      SELECT c.id, c.task_id, c.points, c.completed_at, c.note, t.name as task_name, t.category
      FROM completions c JOIN tasks t ON c.task_id = t.id
      WHERE c.user_id = $1 AND c.member_id = $2 ORDER BY c.completed_at DESC
    `, [userId, memberId]);
    return result.rows.map(row => ({
      id: row.id, task_id: row.task_id, points: row.points,
      completed_at: row.completed_at, note: row.note, task_name: row.task_name, category: row.category
    }));
  },

  getByDateRange(userId, startDate, endDate) {
    const result = query(`
      SELECT c.id, c.member_id, c.task_id, c.points, c.completed_at, c.note,
             m.name as member_name, t.name as task_name, t.category
      FROM completions c
      JOIN members m ON c.member_id = m.id
      JOIN tasks t ON c.task_id = t.id
      WHERE c.user_id = $1 AND c.completed_at BETWEEN $2 AND $3
      ORDER BY c.completed_at DESC, c.id DESC
    `, [userId, startDate, endDate]);
    return result.rows.map(row => ({
      id: row.id, member_id: row.member_id, task_id: row.task_id, points: row.points,
      completed_at: row.completed_at, note: row.note, member_name: row.member_name,
      task_name: row.task_name, category: row.category
    }));
  },

  delete(id, userId) {
    run('DELETE FROM completions WHERE id = $1 AND user_id = $2', [id, userId]);
  }
};

// ============================================================
// 统计操作
// ============================================================
const statsOps = {
  getTotalPoints(userId) {
    // 实际积分 = 获得积分 - 兑换花费积分
    const result = query(`
      SELECT 
        m.id, m.name, m.avatar,
        COALESCE(SUM(c.points), 0) as earned_points,
        COALESCE((
          SELECT SUM(r.points_spent) 
          FROM redemptions r 
          WHERE r.member_id = m.id
        ), 0) as spent_points
      FROM members m
      LEFT JOIN completions c ON m.id = c.member_id
      WHERE m.user_id = $1 
      GROUP BY m.id 
      ORDER BY (COALESCE(SUM(c.points), 0) - COALESCE((
          SELECT SUM(r.points_spent) 
          FROM redemptions r 
          WHERE r.member_id = m.id
        ), 0)) DESC
    `, [userId]);
    return result.rows.map(row => {
      const earned = parseInt(row.earned_points) || 0;
      const spent = parseInt(row.spent_points) || 0;
      return {
        id: row.id, 
        name: row.name, 
        avatar: row.avatar, 
        total_points: earned - spent,
        earned_points: earned,
        spent_points: spent
      };
    });
  },

  getPointsByRange(userId, startDate, endDate) {
    const result = query(`
      SELECT 
        m.id, m.name, m.avatar,
        COALESCE(SUM(c.points), 0) as earned_points,
        COALESCE((
          SELECT SUM(r.points_spent) 
          FROM redemptions r 
          WHERE r.member_id = m.id
        ), 0) as spent_points
      FROM members m
      LEFT JOIN completions c ON m.id = c.member_id AND c.completed_at BETWEEN $2 AND $3
      WHERE m.user_id = $1 
      GROUP BY m.id 
      ORDER BY (COALESCE(SUM(c.points), 0) - COALESCE((
          SELECT SUM(r.points_spent) 
          FROM redemptions r 
          WHERE r.member_id = m.id
        ), 0)) DESC
    `, [startDate, endDate, userId]);
    return result.rows.map(row => {
      const earned = parseInt(row.earned_points) || 0;
      const spent = parseInt(row.spent_points) || 0;
      return {
        id: row.id, name: row.name, avatar: row.avatar, total_points: earned - spent,
        earned_points: earned, spent_points: spent
      };
    });
  },

  getWeeklyRanking(userId) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    return {
      startDate: monday.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      ranking: this.getPointsByRange(userId, monday.toISOString().split('T')[0], today.toISOString().split('T')[0])
    };
  },

  getLastWeekRanking(userId) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return {
      startDate: lastMonday.toISOString().split('T')[0],
      endDate: lastSunday.toISOString().split('T')[0],
      ranking: this.getPointsByRange(userId, lastMonday.toISOString().split('T')[0], lastSunday.toISOString().split('T')[0])
    };
  },

  getMemberDailyStats(userId, memberId, days = 30) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const result = query(`
      SELECT completed_at as date, SUM(points) as points
      FROM completions
      WHERE user_id = $1 AND member_id = $2 AND completed_at BETWEEN $3 AND $4
      GROUP BY completed_at ORDER BY completed_at
    `, [userId, memberId, startDate, endDate]);
    return result.rows.map(row => ({ date: row.date, points: parseInt(row.points) }));
  }
};

// ============================================================
// 积分兑换操作
// ============================================================
const rewardOps = {
  add(userId, name, pointsCost, description = '', stock = -1) {
    const result = run(
      'INSERT INTO rewards (user_id, name, points_cost, description, stock) VALUES ($1, $2, $3, $4, $5)',
      [userId, name, pointsCost, description, stock]
    );
    return { lastInsertRowid: USE_PG ? result.rows[0].id : result.lastInsertRowid };
  },

  getAll(userId) {
    const result = query(
      'SELECT * FROM rewards WHERE user_id = $1 ORDER BY points_cost',
      [userId]
    );
    return result.rows.map(row => ({
      id: row.id, user_id: row.user_id, name: row.name, points_cost: row.points_cost,
      description: row.description, stock: row.stock, created_at: row.created_at
    }));
  },

  getById(id, userId) {
    const result = query(
      'SELECT * FROM rewards WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return { id: row.id, user_id: row.user_id, name: row.name, points_cost: row.points_cost,
      description: row.description, stock: row.stock, created_at: row.created_at };
  },

  update(id, userId, name, pointsCost, description, stock) {
    run(
      'UPDATE rewards SET name = $1, points_cost = $2, description = $3, stock = $4 WHERE id = $5 AND user_id = $6',
      [name, pointsCost, description, stock, id, userId]
    );
  },

  delete(id, userId) {
    run('DELETE FROM rewards WHERE id = $1 AND user_id = $2', [id, userId]);
  }
};

const redemptionOps = {
  redeem(userId, memberId, rewardId) {
    const reward = rewardOps.getById(rewardId, userId);
    if (!reward) throw new Error('奖励不存在');
    if (reward.stock === 0) throw new Error('库存不足');
    
    const member = memberOps.getById(memberId, userId);
    if (!member) throw new Error('成员不存在');
    
    const memberIdNum = parseInt(memberId);
    const totalPoints = statsOps.getTotalPoints(userId).find(m => m.id === memberIdNum);
    if (!totalPoints) {
      throw new Error('成员没有积分记录');
    }
    if (totalPoints.total_points < reward.points_cost) {
      throw new Error('积分不足，当前：' + totalPoints.total_points + '，需要：' + reward.points_cost);
    }
    
    const result = run(
      'INSERT INTO redemptions (user_id, member_id, reward_id, points_spent) VALUES ($1, $2, $3, $4)',
      [userId, memberId, rewardId, reward.points_cost]
    );
    
    if (reward.stock > 0) {
      run('UPDATE rewards SET stock = stock - 1 WHERE id = $1', [rewardId]);
    }
    
    return { lastInsertRowid: USE_PG ? result.rows[0].id : result.lastInsertRowid };
  },

  getByMember(userId, memberId) {
    const result = query(`
      SELECT r.id, r.reward_id, r.points_spent, r.redeemed_at,
             COALESCE(rw.name, '已下架') as reward_name, rw.points_cost
      FROM redemptions r LEFT JOIN rewards rw ON r.reward_id = rw.id
      WHERE r.user_id = $1 AND r.member_id = $2 ORDER BY r.redeemed_at DESC
    `, [userId, memberId]);
    return result.rows.map(row => ({
      id: row.id, reward_id: row.reward_id, points_spent: row.points_spent,
      redeemed_at: row.redeemed_at, reward_name: row.reward_name, points_cost: row.points_cost
    }));
  },

  getAll(userId) {
    const result = query(`
      SELECT r.id, r.member_id, r.reward_id, r.points_spent, r.redeemed_at,
             m.name as member_name, COALESCE(rw.name, '已下架') as reward_name
      FROM redemptions r
      JOIN members m ON r.member_id = m.id
      LEFT JOIN rewards rw ON r.reward_id = rw.id
      WHERE r.user_id = $1 ORDER BY r.redeemed_at DESC
    `, [userId]);
    return result.rows.map(row => ({
      id: row.id, member_id: row.member_id, reward_id: row.reward_id,
      points_spent: row.points_spent, redeemed_at: row.redeemed_at,
      member_name: row.member_name, reward_name: row.reward_name
    }));
  }
};

module.exports = {
  initDatabase, userOps, memberOps, taskOps,
  completionOps, statsOps, rewardOps, redemptionOps
};
