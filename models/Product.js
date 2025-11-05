const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, '商品名称不能为空'],
    trim: true,
    minlength: [2, '商品名称至少需要2个字符'],
    maxlength: [100, '商品名称不能超过100个字符']
  },
  description: {
    type: String,
    required: [true, '商品描述不能为空'],
    trim: true,
    minlength: [10, '商品描述至少需要10个字符'],
    maxlength: [1000, '商品描述不能超过1000个字符']
  },
  category: {
    type: String,
    required: [true, '商品分类不能为空'],
    trim: true,
    enum: {
      values: ['轴承', '紧固件', '电机', '传动设备', '液压元件', '气动元件', '电气设备', '工具', '其他'],
      message: '商品分类必须是预定义的值'
    }
  },
  price: {
    type: Number,
    required: [true, '商品价格不能为空'],
    min: [0, '商品价格不能为负数'],
    max: [1000000, '商品价格不能超过1000000']
  },
  unit: {
    type: String,
    required: [true, '计量单位不能为空'],
    trim: true,
    enum: {
      values: ['个', '台', '套', '米', '公斤', '吨', '支', '箱', '包'],
      message: '计量单位必须是预定义的值'
    }
  },
  specifications: {
    type: Map,
    of: String,
    validate: {
      validator: function(specs) {
        // 限制规格数量
        return specs.size <= 20;
      },
      message: '商品规格不能超过20个'
    }
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '卖家信息不能为空'],
    index: true
  },
  images: [{
    type: String,
    validate: {
      validator: function(images) {
        // 限制图片数量
        return images.length <= 10;
      },
      message: '商品图片不能超过10张'
    }
  }],
  stock: {
    type: Number,
    required: [true, '库存数量不能为空'],
    min: [0, '库存数量不能为负数'],
    default: 0
  },
  minOrderQuantity: {
    type: Number,
    min: [1, '最小起订量必须大于0'],
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  views: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [20, '标签不能超过20个字符']
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段 - 库存状态
productSchema.virtual('stockStatus').get(function() {
  if (this.stock === 0) return '缺货';
  if (this.stock <= 10) return '紧张';
  if (this.stock <= 50) return '一般';
  return '充足';
});

// 虚拟字段 - 是否可购买
productSchema.virtual('isAvailable').get(function() {
  return this.isActive && this.stock > 0;
});

// 复合索引优化
productSchema.index({ seller: 1, createdAt: -1 }); // 卖家商品列表查询
productSchema.index({ category: 1, isActive: 1 }); // 分类查询
productSchema.index({ price: 1 }); // 价格排序
productSchema.index({ stock: 1 }); // 库存查询
productSchema.index({ isActive: 1, stock: -1 }); // 活跃商品库存排序
productSchema.index({ createdAt: -1 }); // 新品排序
productSchema.index({ views: -1 }); // 热门商品排序

// 文本搜索索引（支持商品名称和描述搜索）
productSchema.index({ 
  name: 'text', 
  description: 'text',
  tags: 'text'
}, {
  weights: {
    name: 10,
    tags: 5,
    description: 1
  },
  name: 'product_search_index'
});

// 增加浏览量的方法
productSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save({ validateBeforeSave: false });
};

// 减少库存的方法
productSchema.methods.decreaseStock = async function(quantity) {
  if (this.stock < quantity) {
    throw new Error('库存不足');
  }
  this.stock -= quantity;
  await this.save();
};

// 增加库存的方法
productSchema.methods.increaseStock = async function(quantity) {
  this.stock += quantity;
  await this.save();
};

// 静态方法 - 根据分类获取商品
productSchema.statics.findByCategory = function(category, options = {}) {
  const query = { category, isActive: true };
  return this.find(query)
    .populate('seller', 'username company')
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);
};

// 静态方法 - 搜索商品
productSchema.statics.searchProducts = function(searchTerm, options = {}) {
  const query = { 
    isActive: true,
    $text: { $search: searchTerm }
  };
  
  return this.find(query)
    .populate('seller', 'username company')
    .sort({ score: { $meta: 'textScore' } })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
};

// 静态方法 - 获取热门商品
productSchema.statics.getPopularProducts = function(limit = 10) {
  return this.find({ isActive: true })
    .populate('seller', 'username company')
    .sort({ views: -1 })
    .limit(limit);
};

// 中间件 - 保存前验证价格和库存
productSchema.pre('save', function(next) {
  // 价格保留2位小数
  if (this.price) {
    this.price = Math.round(this.price * 100) / 100;
  }
  
  // 库存取整
  if (this.stock) {
    this.stock = Math.floor(this.stock);
  }
  
  next();
});

module.exports = mongoose.model('Product', productSchema);