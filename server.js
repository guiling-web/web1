const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();

// ==================== 安全中间件配置 ====================
const {
  sessionConfig,
  helmetConfig,
  corsConfig,
  csrfMiddleware,
  validateCsrf,
  getCsrfToken,
  provideCsrfToken,
  sanitizeInput,
  xssProtection,
  authLimiter,
  apiLimiter
} = require('./middleware/security');

// 应用安全中间件（按正确顺序）
app.use(sessionConfig);
app.use(helmetConfig);
app.use(corsConfig);
app.use(xssProtection);
app.use(sanitizeInput);
app.use(csrfMiddleware);

// ==================== 基础中间件配置 ====================
app.use(bodyParser.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        status: 'error',
        message: '无效的JSON格式'
      });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(bodyParser.urlencoded({ 
  extended: true,
  limit: '10mb'
}));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'views')));
app.use('/css', express.static(path.join(__dirname, 'views', 'css')));
app.use('/js', express.static(path.join(__dirname, 'views', 'js')));
app.use('/images', express.static(path.join(__dirname, 'views', 'images')));

// ==================== 自动注入 CSRF Token 的中间件 ====================
const autoInjectCsrfToken = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (typeof data === 'string' && data.includes('name="_csrf"')) {
      const token = res.locals.csrfToken || '';
      // 只替换 CSRF Token 相关的部分，不影响其他HTML结构
      data = data.replace(/name="_csrf" value=""/g, `name="_csrf" value="${token}"`);
      data = data.replace(/<meta name="csrf-token" content="">/g, `<meta name="csrf-token" content="${token}">`);
    }
    originalSend.call(this, data);
  };
  
  next();
};

// ==================== 数据库连接配置 ====================
const connectDatabase = async () => {
  try {
    const mongoURI = 'mongodb://localhost:27017/industrial_platform';
    
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    };

    await mongoose.connect(mongoURI, options);
    
    console.log('✅ MongoDB 连接成功');

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB 连接错误:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB 连接断开');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB 重新连接成功');
    });

  } catch (error) {
    console.error('❌ MongoDB 连接失败:', error);
    process.exit(1);
  }
};

// 初始化数据库连接
connectDatabase();

// ==================== 全局中间件 ====================
// 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// JSON 解析错误处理
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      status: 'error',
      message: '无效的JSON格式'
    });
  }
  next();
});

// ==================== 路由配置 ====================
const auth = require('./middleware/auth');

// CSRF Token 获取路由
app.get('/api/csrf-token', getCsrfToken);

// 认证路由
app.use('/auth', authLimiter, validateCsrf, require('./routes/auth'));

// API 路由 - 使用正确的文件名
app.use('/api/products', auth, apiLimiter, require('./routes/products'));
app.use('/api/users', auth, apiLimiter, validateCsrf, require('./routes/users'));
app.use('/api/inquiries', auth, apiLimiter, require('./routes/inquiries'));

// 测试认证路由
app.get('/api/test-auth', auth, (req, res) => {
  res.json({
    status: 'success',
    message: '认证测试成功',
    user: req.user
  });
});

// 健康检查路由
app.get('/api/health', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 
                    dbState === 2 ? 'connecting' :
                    dbState === 3 ? 'disconnecting' : 'disconnected';

    res.json({
      status: 'success',
      data: {
        server: 'running',
        database: dbStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: 'development'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: '服务异常',
      error: error.message
    });
  }
});

// 安全信息路由
app.get('/api/security-info', (req, res) => {
  res.json({
    status: 'success',
    data: {
      security: {
        helmet: 'enabled',
        cors: 'enabled',
        csrf: 'enabled',
        xss: 'enabled',
        rateLimit: 'enabled',
        environment: 'development'
      }
    }
  });
});

// ==================== 页面路由 ====================
// 使用自动注入 CSRF Token 中间件
app.get('/', provideCsrfToken, autoInjectCsrfToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', provideCsrfToken, autoInjectCsrfToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/register', provideCsrfToken, autoInjectCsrfToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.get('/product-detail', provideCsrfToken, autoInjectCsrfToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'product-detail.html'));
});

app.get('/inquiry-management', provideCsrfToken, autoInjectCsrfToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'inquiry-management.html'));
});

app.get('/user-profile', provideCsrfToken, autoInjectCsrfToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'user-profile.html'));
});

// ==================== 错误处理 ====================
// 404 处理
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({
      status: 'error',
      message: 'API接口不存在'
    });
  } else {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
  }
});

// 全局错误处理
app.use((error, req, res, next) => {
  console.error('全局错误:', error);
  
  if (error.message && error.message.includes('CSRF Token')) {
    return res.status(403).json({
      status: 'error',
      message: '无效的CSRF Token'
    });
  }
  
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      status: 'error',
      message: '数据验证失败',
      errors: errors
    });
  }
  
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      status: 'error',
      message: `${field}已存在`
    });
  }
  
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'error',
      message: '令牌无效'
    });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'error',
      message: '令牌已过期'
    });
  }
  
  if (error.statusCode === 429) {
    return res.status(429).json({
      status: 'error',
      message: '请求过于频繁，请稍后再试'
    });
  }
  
  res.status(error.status || 500).json({
    status: 'error',
    message: error.message
  });
});

// ==================== 服务器启动 ====================
const PORT = 3000;

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
  console.log(`📊 环境: development`);
  console.log(`🌐 地址: http://localhost:${PORT}`);
  console.log(`🛡️  安全功能: 已启用`);
  console.log(`   - Helmet 安全头`);
  console.log(`   - CORS 跨域保护`);
  console.log(`   - CSRF 攻击防护`);
  console.log(`   - XSS 攻击防护`);
  console.log(`   - 输入验证和清理`);
  console.log(`   - 速率限制`);
  console.log(`   - 请求日志`);
  console.log(`📦 已加载路由:`);
  console.log(`   - /auth (认证路由)`);
  console.log(`   - /api/products (商品管理)`);
  console.log(`   - /api/users (用户管理)`);
  console.log(`   - /api/inquiries (询价管理)`);
});