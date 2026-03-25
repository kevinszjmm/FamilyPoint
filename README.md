# 🏠 家庭积分系统

一个简单实用的家庭积分管理系统，帮助家庭成员记录日常任务完成情况，积累积分，每周评选冠军！

## 功能特点

- 👤 **成员管理** - 添加/删除家庭成员
- 📋 **任务管理** - 自定义积分任务和分值
- ✅ **完成记录** - 记录每日完成的任务
- 🏆 **排行榜** - 本周积分排名和总积分排名
- 📊 **周冠军** - 自动评选每周积分最高的成员
- 📜 **历史记录** - 查看任意时间段内的完成记录

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite (better-sqlite3)
- **前端**: 原生 HTML/CSS/JavaScript

## 安装运行

### 1. 安装依赖

```bash
cd ~/.qclaw/workspace/family-points
npm install
```

### 2. 启动服务

```bash
npm start
```

### 3. 访问系统

打开浏览器访问: http://localhost:3000

## 使用说明

### 添加家庭成员

1. 点击「成员管理」标签
2. 输入成员名称（如：爸爸、妈妈、小明）
3. 点击「添加成员」

### 添加积分任务

1. 点击「任务管理」标签
2. 填写任务名称、积分值、分类
3. 点击「添加任务」

**示例任务：**
- 洗碗 (+10分) - 家务
- 打扫房间 (+20分) - 家务
- 完成作业 (+15分) - 学习
- 运动30分钟 (+10分) - 运动

### 记录完成

1. 点击「记录完成」标签
2. 选择日期、成员、任务
3. 可添加备注说明
4. 点击「记录完成」

### 查看排行

- 「排行榜」页面显示本周积分排名和总积分排名
- 本周冠军会高亮显示

## 数据存储

所有数据存储在本地 SQLite 数据库文件：
`~/.qclaw/workspace/family-points/family-points.db`

## API 接口

系统提供 RESTful API：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/members | 获取所有成员 |
| POST | /api/members | 添加成员 |
| DELETE | /api/members/:id | 删除成员 |
| GET | /api/tasks | 获取所有任务 |
| POST | /api/tasks | 添加任务 |
| DELETE | /api/tasks/:id | 删除任务 |
| GET | /api/completions | 获取完成记录 |
| POST | /api/completions | 添加完成记录 |
| DELETE | /api/completions/:id | 删除完成记录 |
| GET | /api/stats/weekly | 获取本周排名 |
| GET | /api/stats/total | 获取总排名 |