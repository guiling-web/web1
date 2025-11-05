const express = require('express');
const Inquiry = require('../models/Inquiry');
const Product = require('../models/Product');
const { 
  body, 
  handleValidationErrors,
  apiLimiter 
} = require('../middleware/security');

const router = express.Router();

// 创建询价验证规则
const createInquiryValidation = [
  body('productId')
    .notEmpty()
    .withMessage('商品ID不能为空')
    .matches(/^[0-9a-fA-F]{24}$/)
    .withMessage('无效的商品ID格式'),
  
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('采购数量必须大于0'),
  
  body('message')
    .notEmpty()
    .withMessage('询价留言不能为空')
    .isLength({ min: 10, max: 500 })
    .withMessage('询价留言必须为10-500位字符')
    .trim(),
  
  body('expectedPrice')
    .optional()
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('期望价格必须在0-1000000之间')
];

// 回复询价验证规则
const respondInquiryValidation = [
  body('message')
    .notEmpty()
    .withMessage('回复内容不能为空')
    .isLength({ min: 10, max: 1000 })
    .withMessage('回复内容必须为10-1000位字符')
    .trim(),
  
  body('price')
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('报价必须在0-1000000之间'),
  
  body('deliveryTime')
    .notEmpty()
    .withMessage('交货时间不能为空')
    .isLength({ max: 100 })
    .withMessage('交货时间描述不能超过100个字符')
    .trim()
];

// 获取用户的询价记录
router.get('/my-inquiries', apiLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const inquiries = await Inquiry.find({ buyer: req.user.id })
      .populate('product', 'name price unit images category')
      .populate('seller', 'username company email phone')
      .select('product quantity message expectedPrice status response createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Inquiry.countDocuments({ buyer: req.user.id });

    res.status(200).json({
      status: 'success',
      results: inquiries.length,
      total,
      data: {
        inquiries
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取用户询价记录错误:', error);
    res.status(500).json({
      status: 'error',
      message: '获取询价记录失败'
    });
  }
});

// 获取卖家收到的询价
router.get('/seller-inquiries', apiLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const inquiries = await Inquiry.find({ seller: req.user.id })
      .populate('product', 'name price unit images category')
      .populate('buyer', 'username company email phone')
      .select('product quantity message expectedPrice status response createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Inquiry.countDocuments({ seller: req.user.id });

    res.status(200).json({
      status: 'success',
      results: inquiries.length,
      total,
      data: {
        inquiries
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取卖家询价记录错误:', error);
    res.status(500).json({
      status: 'error',
      message: '获取询价记录失败'
    });
  }
});

// 创建询价
router.post('/', apiLimiter, createInquiryValidation, handleValidationErrors, async (req, res) => {
  try {
    const { productId, quantity, message, expectedPrice } = req.body;

    // 验证商品是否存在且可用
    const product = await Product.findOne({ 
      _id: productId, 
      isActive: true 
    }).populate('seller');

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: '商品不存在或已下架'
      });
    }

    // 验证库存
    if (product.stock < quantity) {
      return res.status(400).json({
        status: 'error',
        message: `库存不足，当前库存为 ${product.stock}`
      });
    }

    // 防止对自己商品询价
    if (product.seller._id.toString() === req.user.id) {
      return res.status(400).json({
        status: 'error',
        message: '不能对自己的商品进行询价'
      });
    }

    const inquiry = await Inquiry.create({
      product: productId,
      buyer: req.user.id,
      seller: product.seller._id,
      quantity,
      message,
      expectedPrice,
      buyerContact: {
        phone: req.user.phone,
        email: req.user.email
      }
    });

    await inquiry.populate('product', 'name price unit images');
    await inquiry.populate('buyer', 'username company');
    await inquiry.populate('seller', 'username company');

    res.status(201).json({
      status: 'success',
      data: {
        inquiry
      }
    });
  } catch (error) {
    console.error('创建询价错误:', error);
    res.status(500).json({
      status: 'error',
      message: '创建询价失败'
    });
  }
});

// 卖家回复询价
router.patch('/:id/respond', apiLimiter, respondInquiryValidation, handleValidationErrors, async (req, res) => {
  try {
    const { message, price, deliveryTime } = req.body;

    // 验证ID格式
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'error',
        message: '无效的询价ID格式'
      });
    }

    const inquiry = await Inquiry.findOne({
      _id: req.params.id,
      seller: req.user.id
    });

    if (!inquiry) {
      return res.status(404).json({
        status: 'error',
        message: '询价不存在或无权操作'
      });
    }

    if (inquiry.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: '该询价已回复，无法再次回复'
      });
    }

    // 更新询价状态和回复信息
    inquiry.status = 'responded';
    inquiry.response = {
      message,
      price,
      deliveryTime,
      respondedAt: new Date()
    };
    
    await inquiry.save();

    await inquiry.populate('product', 'name price unit');
    await inquiry.populate('buyer', 'username company');
    await inquiry.populate('seller', 'username company');

    res.status(200).json({
      status: 'success',
      data: {
        inquiry
      }
    });
  } catch (error) {
    console.error('回复询价错误:', error);
    res.status(500).json({
      status: 'error',
      message: '回复询价失败'
    });
  }
});

// 获取单个询价详情
router.get('/:id', apiLimiter, async (req, res) => {
  try {
    // 验证ID格式
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'error',
        message: '无效的询价ID格式'
      });
    }

    const inquiry = await Inquiry.findById(req.params.id)
      .populate('product', 'name price unit images category')
      .populate('buyer', 'username company email phone')
      .populate('seller', 'username company email phone');

    if (!inquiry) {
      return res.status(404).json({
        status: 'error',
        message: '询价不存在'
      });
    }

    // 检查权限：只有买家或卖家可以查看
    if (inquiry.buyer._id.toString() !== req.user.id && inquiry.seller._id.toString() !== req.user.id) {
      return res.status(403).json({
        status: 'error',
        message: '无权查看此询价'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        inquiry
      }
    });
  } catch (error) {
    console.error('获取询价详情错误:', error);
    res.status(500).json({
      status: 'error',
      message: '获取询价详情失败'
    });
  }
});

module.exports = router;