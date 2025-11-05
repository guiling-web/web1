const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { 
  body, 
  handleValidationErrors,
  authLimiter,
  validateCsrf  // 添加 CSRF 验证中间件
} = require('../middleware/security');

const router = express.Router();

// 注册验证规则
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 20 })
    .withMessage('用户名必须为3-20位字符')
    .matches(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/)
    .withMessage('用户名只能包含字母、数字、下划线和中文字符')
    .custom(async (username) => {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        throw new Error('用户名已存在');
      }
    }),
  
  body('email')
    .isEmail()
    .withMessage('请输入有效的邮箱地址')
    .normalizeEmail()
    .custom(async (email) => {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error('邮箱地址已存在');
      }
    }),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码至少需要6位字符')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('密码必须包含至少一个大写字母、一个小写字母和一个数字'),
  
  body('company')
    .notEmpty()
    .withMessage('公司名称不能为空')
    .isLength({ max: 100 })
    .withMessage('公司名称不能超过100个字符')
    .trim(),
  
  body('phone')
    .optional()
    .matches(/^1[3-9]\d{9}$/)
    .withMessage('请输入有效的手机号码'),
  
  body('role')
    .isIn(['buyer', 'seller'])
    .withMessage('用户角色必须是 buyer 或 seller')
];

// 登录验证规则
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('请输入有效的邮箱地址')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('密码不能为空')
];

// 注册 - 添加 validateCsrf 中间件
router.post('/register', authLimiter, validateCsrf, registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { username, email, password, company, phone, role } = req.body;

    const user = await User.create({
      username,
      email,
      password,
      company,
      phone,
      role
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'your_jwt_secret', {
      expiresIn: '24h'
    });

    res.status(201).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          company: user.company,
          role: user.role
        }
      }
    });
  } catch (error) {
    // Mongoose 验证错误已经在 handleValidationErrors 中处理
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// 登录 - 添加 validateCsrf 中间件
router.post('/login', authLimiter, validateCsrf, loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findByEmail(email).select('+password +isActive');

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: '邮箱或密码不正确'
      });
    }

    // 检查用户是否被禁用
    if (!user.isActive) {
      return res.status(401).json({
        status: 'error',
        message: '账户已被禁用，请联系管理员'
      });
    }

    // 验证密码
    if (!(await user.correctPassword(password, user.password))) {
      return res.status(401).json({
        status: 'error',
        message: '邮箱或密码不正确'
      });
    }

    // 更新最后登录时间
    await user.updateLastLogin();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'your_jwt_secret', {
      expiresIn: '24h'
    });

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          company: user.company,
          role: user.role
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// 登出路由（如果需要的话）
router.post('/logout', validateCsrf, (req, res) => {
  // 清除会话或执行其他登出逻辑
  res.json({
    status: 'success',
    message: '登出成功'
  });
});

module.exports = router;