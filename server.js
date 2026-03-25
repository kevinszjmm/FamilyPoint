const express = require('express');
const path = require('path');
const { initDatabase, userOps, memberOps, taskOps, completionOps, statsOps, rewardOps, redemptionOps } = require('./database');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 认证中间件
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const user = userOps.getByToken(token);
  if (!user) {
    return res.status(401).json({ error: '登录已过期' });
  }
  
  req.user = user;
  next();
}

// ========== 用户 API ==========

app.post('/api/register', (req, res) => {
  const { username, password, familyName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const result = userOps.register(username, password, familyName);
  res.json(result);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const result = userOps.login(username, password);
  res.json(result);
});

app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    userOps.logout(token);
  }
  res.json({ success: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json(req.user);
});

// ========== 成员 API ==========

app.get('/api/members', auth, (req, res) => {
  res.json(memberOps.getAll(req.user.id));
});

app.post('/api/members', auth, (req, res) => {
  try {
    const result = memberOps.add(req.user.id, req.body.name, req.body.avatar);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/members/:id', auth, (req, res) => {
  try {
    memberOps.update(req.params.id, req.user.id, req.body.name, req.body.avatar);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/members/:id', auth, (req, res) => {
  try {
    memberOps.delete(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ========== 任务 API ==========

app.get('/api/tasks', auth, (req, res) => {
  res.json(taskOps.getAll(req.user.id));
});

app.post('/api/tasks', auth, (req, res) => {
  try {
    const result = taskOps.add(req.user.id, req.body.name, req.body.points, req.body.category, req.body.description);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/tasks/:id', auth, (req, res) => {
  try {
    taskOps.update(req.params.id, req.user.id, req.body.name, req.body.points, req.body.category, req.body.description);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  try {
    taskOps.delete(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ========== 完成记录 API ==========

app.get('/api/completions', auth, (req, res) => {
  const { date, memberId, startDate, endDate } = req.query;
  
  if (date) {
    res.json(completionOps.getByDate(req.user.id, date));
  } else if (memberId) {
    res.json(completionOps.getByMember(req.user.id, memberId));
  } else if (startDate && endDate) {
    res.json(completionOps.getByDateRange(req.user.id, startDate, endDate));
  } else {
    const today = new Date().toISOString().split('T')[0];
    res.json(completionOps.getByDate(req.user.id, today));
  }
});

app.post('/api/completions', auth, (req, res) => {
  try {
    const result = completionOps.add(
      req.user.id,
      req.body.memberId,
      req.body.taskId,
      req.body.date,
      req.body.note
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/completions/:id', auth, (req, res) => {
  try {
    completionOps.delete(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ========== 统计 API ==========

app.get('/api/stats/total', auth, (req, res) => {
  res.json(statsOps.getTotalPoints(req.user.id));
});

app.get('/api/stats/weekly', auth, (req, res) => {
  res.json(statsOps.getWeeklyRanking(req.user.id));
});

app.get('/api/stats/last-week', auth, (req, res) => {
  res.json(statsOps.getLastWeekRanking(req.user.id));
});

app.get('/api/stats/member/:id/daily', auth, (req, res) => {
  const days = parseInt(req.query.days) || 30;
  res.json(statsOps.getMemberDailyStats(req.user.id, req.params.id, days));
});

// ========== 积分兑换 API ==========

app.get('/api/rewards', auth, (req, res) => {
  res.json(rewardOps.getAll(req.user.id));
});

app.post('/api/rewards', auth, (req, res) => {
  try {
    const { name, pointsCost, description, stock } = req.body;
    if (!name || !pointsCost) {
      return res.status(400).json({ error: '名称和积分不能为空' });
    }
    const result = rewardOps.add(req.user.id, name, pointsCost, description || '', stock ?? -1);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/rewards/:id', auth, (req, res) => {
  try {
    const { name, pointsCost, description, stock } = req.body;
    rewardOps.update(req.params.id, req.user.id, name, pointsCost, description, stock ?? -1);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/rewards/:id', auth, (req, res) => {
  try {
    rewardOps.delete(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 兑换
app.post('/api/redemptions', auth, (req, res) => {
  try {
    const { memberId, rewardId } = req.body;
    if (!memberId || !rewardId) {
      return res.status(400).json({ error: '请选择成员和奖励' });
    }
    const result = redemptionOps.redeem(req.user.id, memberId, rewardId);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/redemptions', auth, (req, res) => {
  const { memberId } = req.query;
  if (memberId) {
    res.json(redemptionOps.getByMember(req.user.id, memberId));
  } else {
    res.json(redemptionOps.getAll(req.user.id));
  }
});

// 主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动
async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`\n🏠 家庭积分系统已启动！`);
    console.log(`📱 访问地址: http://localhost:${PORT}\n`);
  });
}

start();