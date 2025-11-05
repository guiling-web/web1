const Tokens = require('csrf');
const tokens = new Tokens();

const csrfMiddleware = (req, res, next) => {
  // 为每个会话生成 CSRF secret
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }

  // 生成 CSRF token
  res.locals.csrfToken = tokens.create(req.session.csrfSecret);
  
  // 验证 CSRF token 的中间件
  req.validateCsrf = (token) => {
    return tokens.verify(req.session.csrfSecret, token);
  };

  next();
};

// CSRF token 获取端点
const getCsrfToken = (req, res) => {
  res.json({
    status: 'success',
    data: {
      csrfToken: res.locals.csrfToken
    }
  });
};

// CSRF 验证中间件
const validateCsrf = (req, res, next) => {
  // 跳过 GET、HEAD、OPTIONS 请求
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  
  if (!token || !req.validateCsrf(token)) {
    return res.status(403).json({
      status: 'error',
      message: '无效的 CSRF Token'
    });
  }

  next();
};

module.exports = {
  csrfMiddleware,
  getCsrfToken,
  validateCsrf
};