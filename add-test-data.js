const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');

async function addTestData() {
    try {
        console.log('开始添加测试数据...');
        
        // 连接数据库
        await mongoose.connect('mongodb://localhost:27017/industrial_platform', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('数据库连接成功');

        // 检查是否已存在测试卖家
        let seller = await User.findOne({ email: 'testseller@example.com' });
        
        if (!seller) {
            // 创建测试卖家
            seller = await User.create({
                username: 'testseller',
                email: 'testseller@example.com',
                password: '123456',
                company: '工业零部件供应商有限公司',
                phone: '13800138000',
                role: 'seller'
            });
            console.log('创建测试卖家成功:', seller.username);
        } else {
            console.log('测试卖家已存在:', seller.username);
        }

        // 删除现有测试商品（避免重复）
        await Product.deleteMany({ seller: seller._id });
        console.log('清理现有测试商品');
        
        // 创建测试商品
        const products = await Product.create([
            {
                name: 'NSK 6308 深沟球轴承',
                description: '高质量深沟球轴承，适用于各种工业机械设备，耐磨耐用',
                category: '轴承',
                price: 45.80,
                unit: '个',
                specifications: {
                    material: 'GCr15轴承钢',
                    size: '40×90×23mm',
                    precision: 'P0级'
                },
                seller: seller._id,
                stock: 500,
                images: []
            },
            {
                name: '304不锈钢内六角螺丝 M6×25',
                description: '304不锈钢内六角圆柱头螺丝，防锈耐腐蚀，适用于户外环境',
                category: '紧固件',
                price: 0.35,
                unit: '个',
                specifications: {
                    material: '304不锈钢',
                    size: 'M6×25mm',
                    headType: '内六角'
                },
                seller: seller._id,
                stock: 10000,
                images: []
            },
            {
                name: 'Y系列三相异步电动机 5.5KW',
                description: '高效节能三相异步电动机，运行稳定，噪音低，寿命长',
                category: '电机',
                price: 1280.00,
                unit: '台',
                specifications: {
                    power: '5.5KW',
                    voltage: '380V',
                    speed: '1450rpm',
                    protection: 'IP55'
                },
                seller: seller._id,
                stock: 20,
                images: []
            }
        ]);

        console.log('创建测试商品成功:', products.length, '个');
        console.log('测试数据添加完成！');

        process.exit(0);
    } catch (error) {
        console.error('添加测试数据失败:', error);
        process.exit(1);
    }
}

addTestData();