const mongoose = require('mongoose');

class Database {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) {
      return;
    }

    try {
      // MongoDB 连接配置
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // 服务器选择超时
        socketTimeoutMS: 45000, // socket 超时
        maxPoolSize: 10, // 连接池大小
        minPoolSize: 5, // 最小连接数
        maxIdleTimeMS: 30000, // 最大空闲时间
      };

      await mongoose.connect('mongodb://localhost:27017/industrial_platform', options);
      
      this.isConnected = true;
      console.log('✅ MongoDB 连接成功');

      // 监听连接事件
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB 连接错误:', err);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB 连接断开');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB 重新连接成功');
        this.isConnected = true;
      });

    } catch (error) {
      console.error('❌ MongoDB 连接失败:', error);
      throw error;
    }
  }

  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('✅ MongoDB 连接已断开');
    } catch (error) {
      console.error('❌ MongoDB 断开连接失败:', error);
      throw error;
    }
  }

  // 健康检查
  async healthCheck() {
    try {
      await mongoose.connection.db.admin().ping();
      return {
        status: 'healthy',
        connection: this.isConnected,
        readyState: mongoose.connection.readyState
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connection: this.isConnected,
        readyState: mongoose.connection.readyState,
        error: error.message
      };
    }
  }
}

module.exports = new Database();