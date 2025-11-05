const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, '商品信息不能为空'],
    index: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '买家信息不能为空'],
    index: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '卖家信息不能为空'],
    index: true
  },
  quantity: {
    type: Number,
    required: [true, '采购数量不能为空'],
    min: [1, '采购数量必须大于0'],
    validate: {
      validator: async function(quantity) {
        // 验证库存是否足够（在路由层更准确，这里作为额外验证）
        if (this.product && this.product.stock < quantity) {
          return false;
        }
        return true;
      },
      message: '采购数量不能超过商品库存'
    }
  },
  message: {
    type: String,
    required: [true, '询价留言不能为空'],
    trim: true,
    minlength: [10, '询价留言至少需要10个字符'],
    maxlength: [500, '询价留言不能超过500个字符']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'responded', 'accepted', 'rejected', 'completed', 'cancelled'],
      message: '询价状态必须是预定义的值'
    },
    default: 'pending'
  },
  buyerContact: {
    phone: {
      type: String,
      trim: true,
      match: [/^1[3-9]\d{9}$|^$/, '请输入有效的手机号码']
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '请输入有效的邮箱地址']
    }
  },
  response: {
    message: {
      type: String,
      trim: true,
      maxlength: [1000, '回复内容不能超过1000个字符']
    },
    price: {
      type: Number,
      min: [0, '报价不能为负数'],
      max: [1000000, '报价不能超过1000000']
    },
    deliveryTime: {
      type: String,
      trim: true,
      maxlength: [100, '交货时间描述不能超过100个字符']
    },
    respondedAt: {
      type: Date
    }
  },
  expectedPrice: {
    type: Number,
    min: [0, '期望价格不能为负数'],
    max: [1000000, '期望价格不能超过1000000']
  },
  urgency: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high'],
      message: '紧急程度必须是 low、medium 或 high'
    },
    default: 'medium'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段 - 是否可回复
inquirySchema.virtual('canRespond').get(function() {
  return this.status === 'pending';
});

// 虚拟字段 - 是否已完成
inquirySchema.virtual('isCompleted').get(function() {
  return ['accepted', 'rejected', 'completed', 'cancelled'].includes(this.status);
});

// 虚拟字段 - 响应时间（小时）
inquirySchema.virtual('responseTime').get(function() {
  if (!this.response?.respondedAt) return null;
  const responseTime = this.response.respondedAt - this.createdAt;
  return Math.round(responseTime / (1000 * 60 * 60)); // 转换为小时
});

// 复合索引优化
inquirySchema.index({ buyer: 1, createdAt: -1 }); // 买家询价列表
inquirySchema.index({ seller: 1, createdAt: -1 }); // 卖家收到的询价列表
inquirySchema.index({ product: 1, createdAt: -1 }); // 商品相关询价
inquirySchema.index({ status: 1, createdAt: -1 }); // 按状态查询
inquirySchema.index({ buyer: 1, status: 1 }); // 买家状态查询
inquirySchema.index({ seller: 1, status: 1 }); // 卖家状态查询
inquirySchema.index({ createdAt: 1 }); // 时间范围查询
inquirySchema.index({ 'response.respondedAt': -1 }); // 回复时间排序

// 文本搜索索引（支持询价内容搜索）
inquirySchema.index({ 
  message: 'text',
  'response.message': 'text'
}, {
  weights: {
    message: 10,
    'response.message': 5
  },
  name: 'inquiry_search_index'
});

// 实例方法 - 回复询价
inquirySchema.methods.respondToInquiry = async function(responseData) {
  if (this.status !== 'pending') {
    throw new Error('该询价已回复，无法再次回复');
  }
  
  this.status = 'responded';
  this.response = {
    message: responseData.message,
    price: responseData.price,
    deliveryTime: responseData.deliveryTime,
    respondedAt: new Date()
  };
  
  await this.save();
  return this;
};

// 实例方法 - 更新状态
inquirySchema.methods.updateStatus = async function(newStatus) {
  const validTransitions = {
    pending: ['responded', 'cancelled'],
    responded: ['accepted', 'rejected', 'completed'],
    accepted: ['completed', 'cancelled'],
    rejected: ['cancelled'],
    completed: [],
    cancelled: []
  };
  
  if (!validTransitions[this.status].includes(newStatus)) {
    throw new Error(`无法从 ${this.status} 状态切换到 ${newStatus} 状态`);
  }
  
  this.status = newStatus;
  await this.save();
  return this;
};

// 静态方法 - 获取买家询价统计
inquirySchema.statics.getBuyerStats = async function(buyerId) {
  const stats = await this.aggregate([
    { $match: { buyer: mongoose.Types.ObjectId(buyerId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  return stats.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});
};

// 静态方法 - 获取卖家询价统计
inquirySchema.statics.getSellerStats = async function(sellerId) {
  const stats = await this.aggregate([
    { $match: { seller: mongoose.Types.ObjectId(sellerId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  return stats.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});
};

// 静态方法 - 获取待回复询价数量
inquirySchema.statics.getPendingCount = function(sellerId) {
  return this.countDocuments({ 
    seller: sellerId, 
    status: 'pending' 
  });
};

// 中间件 - 保存前验证
inquirySchema.pre('save', function(next) {
  // 价格保留2位小数
  if (this.expectedPrice) {
    this.expectedPrice = Math.round(this.expectedPrice * 100) / 100;
  }
  
  if (this.response?.price) {
    this.response.price = Math.round(this.response.price * 100) / 100;
  }
  
  // 数量取整
  if (this.quantity) {
    this.quantity = Math.floor(this.quantity);
  }
  
  next();
});

module.exports = mongoose.model('Inquiry', inquirySchema);