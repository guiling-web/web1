const helmet = require('helmet');
const cors = require('cors');
const Tokens = require('csrf');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { body, validationResult } = require('express-validator');
const sanitizeHtml = require('sanitize-html');
const xss = require('xss');

// 环境判断
const isProduction = process.env.NODE_ENV === 'production';

// 初始化 CSRF tokens
const tokens = new Tokens();

// 会话配置
const sessionConfig = session({
  secret: process.env.SESSION_SECRET || 'industrial-platform-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
});

// Helmet 安全头配置
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcElem: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" },
  hsts: isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false
});

// CORS 配置
const corsConfig = cors({
  origin: isProduction 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With']
});

// ==================== 修复的 CSRF 中间件 ====================
const csrfMiddleware = (req, res, next) => {
  // 为每个会话生成 CSRF secret（如果不存在）
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
    console.log('🆕 生成新的 CSRF Secret for session:', req.sessionID);
  }

  // 为每个请求生成新的 CSRF token
  res.locals.csrfToken = tokens.create(req.session.csrfSecret);
  
  console.log('🔑 生成的 CSRF Token:', res.locals.csrfToken);
  
  // 将验证方法附加到请求对象
  req.validateCsrf = (token) => {
    if (!token) {
      console.warn('⚠️ CSRF 验证: token 为空');
      return false;
    }
    try {
      const isValid = tokens.verify(req.session.csrfSecret, token);
      console.log(`🔍 CSRF Token 验证: ${isValid ? '有效' : '无效'}`);
      return isValid;
    } catch (error) {
      console.error('❌ CSRF 验证错误:', error.message);
      return false;
    }
  };

  next();
};

// 为页面渲染提供 CSRF Token 的中间件
const provideCsrfToken = (req, res, next) => {
  // 确保 CSRF Token 已生成
  if (!res.locals.csrfToken && req.session.csrfSecret) {
    res.locals.csrfToken = tokens.create(req.session.csrfSecret);
    console.log('📄 为页面提供 CSRF Token:', res.locals.csrfToken);
  } else if (!req.session.csrfSecret) {
    console.warn('⚠️ 无法提供 CSRF Token: 没有 CSRF Secret');
  }
  next();
};

// 获取 CSRF Token 的路由处理
const getCsrfToken = (req, res) => {
  if (!res.locals.csrfToken && req.session.csrfSecret) {
    res.locals.csrfToken = tokens.create(req.session.csrfSecret);
  }
  
  res.json({ 
    status: 'success',
    data: {
      csrfToken: res.locals.csrfToken,
      expiresIn: '24小时'
    }
  });
};

// CSRF 验证中间件 - 智能版本（自动跳过认证路由）
const validateCsrf = (req, res, next) => {
  // 跳过安全的 HTTP 方法
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // 定义不需要 CSRF 验证的路由列表
  const skipPaths = [
    '/auth/register',    // 注册 - 新用户没有会话
    '/auth/login',       // 登录 - 登录前没有有效会话
    '/api/health',       // 健康检查
    '/api/csrf-token',   // CSRF Token 获取
    '/api/debug/session' // 调试路由
  ];

  // 检查当前路径是否在跳过列表中
  if (skipPaths.some(path => req.path === path)) {
    console.log(`🚫 跳过 CSRF 验证: ${req.method} ${req.path}`);
    return next();
  }

  // 检查是否是认证路由的其他路径
  if (req.path.startsWith('/auth/') && req.path !== '/auth/logout') {
    console.log(`🚫 跳过认证路由 CSRF 验证: ${req.method} ${req.path}`);
    return next();
  }

  console.log(`🔐 CSRF 验证: ${req.method} ${req.path}`);
  console.log('Session ID:', req.sessionID);
  console.log('CSRF Secret exists:', !!req.session.csrfSecret);

  // 从多个可能的位置获取 token
  const token = req.headers['x-csrf-token'] || 
                req.headers['x-xsrf-token'] ||
                req.body._csrf;

  console.log('提取的 CSRF Token:', token ? '存在' : '不存在');

  if (!token) {
    console.error('❌ 缺少 CSRF Token');
    return res.status(403).json({
      status: 'error',
      message: '安全验证失败：缺少 CSRF Token',
      details: {
        suggestion: '请确保前端正确设置了 CSRF Token',
        expectedHeaders: ['X-CSRF-Token', 'X-XSRF-Token'],
        expectedBodyField: '_csrf',
        debug: {
          sessionId: req.sessionID,
          hasCsrfSecret: !!req.session.csrfSecret,
          receivedHeaders: Object.keys(req.headers).filter(key => 
            key.toLowerCase().includes('csrf') || key.toLowerCase().includes('xsrf')
          )
        }
      }
    });
  }

  if (!req.validateCsrf(token)) {
    console.error('❌ 无效的 CSRF Token');
    console.error('期望的 Secret:', req.session.csrfSecret);
    console.error('提供的 Token:', token);
    
    return res.status(403).json({
      status: 'error',
      message: '安全验证失败：无效的 CSRF Token',
      details: {
        suggestion: 'Token 可能已过期或被篡改，请刷新页面重试',
        possibleReasons: [
          '会话已过期',
          'CSRF Secret 已重置',
          'Token 格式错误',
          '跨站请求伪造尝试'
        ],
        debug: {
          sessionId: req.sessionID,
          tokenLength: token.length,
          secretExists: !!req.session.csrfSecret
        }
      }
    });
  }

  console.log('✅ CSRF 验证通过');
  next();
};

// 简化的 CSRF 验证（用于测试）
const validateCsrfSimple = (req, res, next) => {
  // 跳过安全的 HTTP 方法
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  
  if (!token) {
    return res.status(403).json({
      status: 'error',
      message: '缺少 CSRF Token'
    });
  }

  if (!req.validateCsrf(token)) {
    return res.status(403).json({
      status: 'error',
      message: '无效的 CSRF Token'
    });
  }

  next();
};

// 输入清理中间件
const sanitizeInput = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
        textFilter: (text) => {
          return text.replace(/[<>]/g, '');
        }
      }).trim();
    }
    return value;
  };

  if (req.body) {
    Object.keys(req.body).forEach(key => {
      // 跳过 _csrf 字段，因为我们需要原始 token
      if (key !== '_csrf') {
        req.body[key] = sanitizeValue(req.body[key]);
      }
    });
  }
  
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      req.query[key] = sanitizeValue(req.query[key]);
    });
  }
  
  next();
};

// XSS 防护中间件
const xssProtection = (req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    if (typeof data === 'string') {
      data = xss(data, {
        whiteList: {},
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style']
      });
    } else if (typeof data === 'object' && data !== null) {
      data = sanitizeObject(data);
    }
    originalSend.call(this, data);
  };
  next();
};

// 递归清理对象
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = xss(value, {
        whiteList: {},
        stripIgnoreTag: true
      });
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// 速率限制配置
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 增加限制次数
  message: {
    status: 'error',
    message: '尝试次数过多，请15分钟后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    status: 'error',
    message: '请求过于频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 验证错误处理中间件
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: '数据验证失败',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

module.exports = {
  sessionConfig,
  helmetConfig,
  corsConfig,
  csrfMiddleware,
  validateCsrf,
  validateCsrfSimple, // 新增简化版本
  getCsrfToken,
  provideCsrfToken,
  sanitizeInput,
  xssProtection,
  authLimiter,
  apiLimiter,
  handleValidationErrors,
  body,
  validationResult
};