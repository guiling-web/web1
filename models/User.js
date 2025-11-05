const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, '用户名不能为空'],
    unique: true,
    trim: true,
    minlength: [3, '用户名至少需要3个字符'],
    maxlength: [20, '用户名不能超过20个字符'],
    match: [/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, '用户名只能包含字母、数字、下划线和中文字符']
  },
  email: {
    type: String,
    required: [true, '邮箱地址不能为空'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '请输入有效的邮箱地址']
  },
  password: {
    type: String,
    required: [true, '密码不能为空'],
    minlength: [6, '密码至少需要6个字符'],
    select: false // 默认不返回密码字段
  },
  company: {
    type: String,
    required: [true, '公司名称不能为空'],
    trim: true,
    maxlength: [100, '公司名称不能超过100个字符']
  },
  phone: {
    type: String,
    trim: true,
    match: [/^1[3-9]\d{9}$|^$/, '请输入有效的手机号码'],
    sparse: true // 允许空值且唯一
  },
  role: {
    type: String,
    enum: {
      values: ['buyer', 'seller', 'admin'],
      message: '用户角色必须是 buyer、seller 或 admin'
    },
    default: 'buyer'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段 - 显示名称
userSchema.virtual('displayName').get(function() {
  return `${this.username} (${this.company})`;
});

// 索引优化
userSchema.index({ email: 1 }); // 邮箱查询索引
userSchema.index({ username: 1 }); // 用户名查询索引
userSchema.index({ role: 1, createdAt: -1 }); // 按角色和创建时间排序索引
userSchema.index({ company: 'text' }); // 公司名称文本搜索索引
userSchema.index({ isActive: 1 }); // 活跃用户查询索引
userSchema.index({ lastLogin: -1 }); // 最后登录时间索引

// 密码加密中间件
userSchema.pre('save', async function(next) {
  // 只有在密码被修改时才加密
  if (!this.isModified('password')) return next();
  
  try {
    // 加密密码
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// 更新最后登录时间的方法
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  await this.save({ validateBeforeSave: false });
};

// 密码验证方法
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// 检查用户是否活跃
userSchema.methods.isUserActive = function() {
  return this.isActive;
};

// 静态方法 - 根据邮箱查找用户（包含密码）
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email }).select('+password');
};

// 静态方法 - 获取活跃用户数量
userSchema.statics.getActiveUsersCount = function(role = null) {
  const query = { isActive: true };
  if (role) query.role = role;
  return this.countDocuments(query);
};

module.exports = mongoose.model('User', userSchema);