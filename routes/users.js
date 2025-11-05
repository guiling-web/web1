const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        res.status(200).json({
            status: 'success',
            data: {
                user
            }
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

// 获取用户个人资料
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: '用户不存在'
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                user
            }
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

// 更新用户个人资料
router.patch('/profile', auth, async (req, res) => {
    try {
        const { company, phone, currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: '用户不存在'
            });
        }

        // 更新基本信息
        user.company = company;
        user.phone = phone;
        
        // 如果提供了密码，验证并更新密码
        if (currentPassword && newPassword) {
            // 验证当前密码
            const isCorrectPassword = await user.correctPassword(currentPassword, user.password);
            if (!isCorrectPassword) {
                return res.status(400).json({
                    status: 'error',
                    message: '当前密码不正确'
                });
            }
            
            // 更新密码
            user.password = newPassword;
        }
        
        await user.save();
        
        // 返回更新后的用户信息（不包含密码）
        const updatedUser = await User.findById(req.user.id);
        
        res.status(200).json({
            status: 'success',
            data: {
                user: updatedUser
            }
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

module.exports = router;