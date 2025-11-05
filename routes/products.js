const express = require('express');
const Product = require('../models/Product');
const { 
  body, 
  handleValidationErrors,
  apiLimiter 
} = require('../middleware/security');

const router = express.Router();

// 商品创建验证规则
const createProductValidation = [
  body('name')
    .notEmpty()
    .withMessage('商品名称不能为空')
    .isLength({ min: 2, max: 100 })
    .withMessage('商品名称必须为2-100位字符')
    .trim(),
  
  body('description')
    .notEmpty()
    .withMessage('商品描述不能为空')
    .isLength({ min: 10, max: 1000 })
    .withMessage('商品描述必须为10-1000位字符')
    .trim(),
  
  body('category')
    .isIn(['轴承', '紧固件', '电机', '传动设备', '液压元件', '气动元件', '电气设备', '工具', '其他'])
    .withMessage('请选择有效的商品分类'),
  
  body('price')
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('商品价格必须在0-1000000之间'),
  
  body('unit')
    .isIn(['个', '台', '套', '米', '公斤', '吨', '支', '箱', '包'])
    .withMessage('请选择有效的计量单位'),
  
  body('stock')
    .isInt({ min: 0 })
    .withMessage('库存数量必须为非负整数'),
  
  body('minOrderQuantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('最小起订量必须大于0')
];

// 获取所有商品 - 移除 auth 中间件，因为已经在 server.js 中应用
router.get('/', apiLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // 防止过大的分页请求
    if (limit > 100) {
      return res.status(400).json({
        status: 'error',
        message: '每页数量不能超过100'
      });
    }

    const products = await Product.find({ isActive: true })
      .populate('seller', 'username company')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
    
    const total = await Product.countDocuments({ isActive: true });

    res.status(200).json({
      status: 'success',
      results: products.length,
      data: {
        products
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取商品列表错误:', error);
    res.status(500).json({
      status: 'error',
      message: '获取商品列表失败'
    });
  }
});

// 创建商品 - 移除 auth 中间件
router.post('/', apiLimiter, createProductValidation, handleValidationErrors, async (req, res) => {
  try {
    // 检查用户角色是否为卖家
    if (req.user.role !== 'seller') {
      return res.status(403).json({
        status: 'error',
        message: '只有卖家可以创建商品'
      });
    }

    const product = await Product.create({
      ...req.body,
      seller: req.user.id
    });

    await product.populate('seller', 'username company');

    res.status(201).json({
      status: 'success',
      data: {
        product
      }
    });
  } catch (error) {
    console.error('创建商品错误:', error);
    res.status(500).json({
      status: 'error',
      message: '创建商品失败'
    });
  }
});

// 获取单个商品详情 - 移除 auth 中间件
router.get('/:id', apiLimiter, async (req, res) => {
  try {
    // 验证ID格式
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'error',
        message: '无效的商品ID格式'
      });
    }

    const product = await Product.findById(req.params.id)
      .populate('seller', 'username company')
      .where({ isActive: true });

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: '商品不存在'
      });
    }

    // 增加浏览量
    await product.incrementViews();

    res.status(200).json({
      status: 'success',
      data: {
        product
      }
    });
  } catch (error) {
    console.error('获取商品详情错误:', error);
    res.status(500).json({
      status: 'error',
      message: '获取商品详情失败'
    });
  }
});

// 搜索商品 - 移除 auth 中间件
router.get('/search/:query', apiLimiter, async (req, res) => {
  try {
    const query = req.params.query;
    
    // 验证搜索查询长度
    if (query.length < 2 || query.length > 50) {
      return res.status(400).json({
        status: 'error',
        message: '搜索关键词必须为2-50个字符'
      });
    }

    const products = await Product.find({
      $and: [
        { isActive: true },
        {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { category: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    })
    .populate('seller', 'username company')
    .limit(20)
    .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: products.length,
      data: {
        products
      }
    });
  } catch (error) {
    console.error('搜索商品错误:', error);
    res.status(500).json({
      status: 'error',
      message: '搜索商品失败'
    });
  }
});

module.exports = router;