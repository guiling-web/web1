// 全局应用JavaScript
class IndustrialPlatform {
    constructor() {
        this.init();
    }

    init() {
        this.checkAuth();
        this.bindEvents();
        this.initProductDetails();
        this.initCSRF(); // 新增：初始化 CSRF Token
    }

    // 新增：初始化 CSRF Token
    initCSRF() {
        // 从 meta 标签获取 CSRF Token
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || 
                        document.querySelector('input[name="_csrf"]')?.value;
        
        if (this.csrfToken) {
            console.log('CSRF Token 已加载:', this.csrfToken);
        } else {
            console.warn('未找到 CSRF Token');
        }
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        const currentPath = window.location.pathname;
        
        if (!token && currentPath !== '/' && currentPath !== '/register') {
            window.location.href = '/';
        }
        
        if (token && (currentPath === '/' || currentPath === '/register')) {
            window.location.href = '/dashboard';
        }
    }

    bindEvents() {
        // 全局事件绑定
        const logoutBtn = document.getElementById('logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.logout.bind(this));
        }
    }

    // 新增：初始化商品详情功能
    initProductDetails() {
        // 为所有查看详情按钮添加事件委托
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('view-detail-btn') || 
                e.target.closest('.view-detail-btn')) {
                this.handleViewDetail(e);
            }
        });

        // 如果是商品详情页，加载商品数据
        if (window.location.pathname === '/product-detail') {
            this.loadProductDetail();
        }
    }

    // 新增：处理查看详情点击
    handleViewDetail(event) {
        event.preventDefault();
        
        const button = event.target.classList.contains('view-detail-btn') 
            ? event.target 
            : event.target.closest('.view-detail-btn');
        
        const productCard = button.closest('.product-card');
        const productId = productCard?.getAttribute('data-product-id');

        if (productId) {
            console.log('查看商品详情:', productId);
            this.navigateToProductDetail(productId);
        } else {
            console.error('未找到商品ID');
            this.showMessage('无法获取商品信息，请刷新页面重试', 'error');
        }
    }

    // 新增：跳转到商品详情页
    navigateToProductDetail(productId) {
        // 保存当前商品ID到sessionStorage，以便详情页使用
        sessionStorage.setItem('currentProductId', productId);
        window.location.href = `/product-detail?id=${productId}`;
    }

    // 新增：加载商品详情
    async loadProductDetail() {
        const urlParams = new URLSearchParams(window.location.search);
        let productId = urlParams.get('id');
        
        // 如果URL中没有ID，尝试从sessionStorage获取
        if (!productId) {
            productId = sessionStorage.getItem('currentProductId');
        }

        if (!productId) {
            this.showMessage('商品信息不存在', 'error');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 2000);
            return;
        }

        try {
            this.showLoading('正在加载商品详情...');
            
            const response = await this.apiCall(`/api/products/${productId}`);
            
            if (response.status === 'success') {
                this.renderProductDetail(response.data.product);
            } else {
                throw new Error(response.message || '获取商品详情失败');
            }
        } catch (error) {
            console.error('加载商品详情错误:', error);
            this.showMessage('加载商品详情失败: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    // 新增：渲染商品详情
    renderProductDetail(product) {
        // 更新页面标题
        document.title = `${product.name} - 工业平台`;
        
        // 渲染商品详情内容
        const detailContainer = document.getElementById('product-detail-container');
        if (detailContainer) {
            detailContainer.innerHTML = `
                <div class="product-detail">
                    <div class="product-images">
                        ${product.images && product.images.length > 0 ? 
                            `<img src="${product.images[0]}" alt="${product.name}" />` : 
                            '<div class="no-image">暂无图片</div>'
                        }
                    </div>
                    <div class="product-info">
                        <h1>${product.name}</h1>
                        <div class="product-meta">
                            <span class="category">分类: ${product.category}</span>
                            <span class="supplier">供应商: ${product.seller?.company || '未知'}</span>
                        </div>
                        <div class="product-price">¥${product.price} / ${product.unit}</div>
                        <div class="product-stock">库存: ${product.stock} ${product.unit}</div>
                        <div class="product-description">
                            <h3>商品描述</h3>
                            <p>${product.description}</p>
                        </div>
                        <div class="product-actions">
                            <button class="btn btn-primary" onclick="app.handleInquiry('${product._id}')">
                                立即询价
                            </button>
                            <button class="btn btn-secondary" onclick="window.history.back()">
                                返回列表
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // 新增：处理询价
    async handleInquiry(productId) {
        try {
            const quantity = prompt('请输入采购数量:');
            if (!quantity || isNaN(quantity) || quantity <= 0) {
                this.showMessage('请输入有效的数量', 'error');
                return;
            }

            const message = prompt('请输入询价留言 (10-500字符):');
            if (!message || message.length < 10 || message.length > 500) {
                this.showMessage('留言必须为10-500个字符', 'error');
                return;
            }

            const response = await this.apiCall('/api/inquiries', {
                method: 'POST',
                body: JSON.stringify({
                    productId: productId,
                    quantity: parseInt(quantity),
                    message: message,
                    _csrf: this.csrfToken // 新增：包含 CSRF Token
                })
            });

            if (response.status === 'success') {
                this.showMessage('询价提交成功!', 'success');
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            console.error('提交询价错误:', error);
            this.showMessage('提交询价失败: ' + error.message, 'error');
        }
    }

    // 新增：显示消息
    showMessage(message, type = 'info') {
        // 移除现有的消息
        const existingMessage = document.querySelector('.global-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // 创建新消息
        const messageDiv = document.createElement('div');
        messageDiv.className = `global-message message-${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            z-index: 10000;
            max-width: 300px;
            ${type === 'success' ? 'background: #28a745;' : ''}
            ${type === 'error' ? 'background: #dc3545;' : ''}
            ${type === 'info' ? 'background: #17a2b8;' : ''}
        `;

        document.body.appendChild(messageDiv);

        // 3秒后自动消失
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 3000);
    }

    // 新增：显示加载状态
    showLoading(message = '加载中...') {
        // 移除现有的加载提示
        this.hideLoading();

        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'global-loading';
        loadingDiv.innerHTML = `
            <div class="loading-overlay">
                <div class="loading-spinner"></div>
                <div class="loading-text">${message}</div>
            </div>
        `;
        loadingDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        `;

        document.body.appendChild(loadingDiv);
    }

    // 新增：隐藏加载状态
    hideLoading() {
        const loadingDiv = document.getElementById('global-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('currentProductId'); // 清理商品ID
        window.location.href = '/';
    }

    // API调用封装 - 修改：添加 CSRF Token 支持
    async apiCall(url, options = {}) {
        const token = localStorage.getItem('token');
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
                ...(this.csrfToken && { 'X-CSRF-Token': this.csrfToken }) // 新增：CSRF Token 头
            }
        };

        // 如果是 POST/PUT/PATCH/DELETE 请求，在请求体中包含 CSRF Token
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase()) && this.csrfToken) {
            if (options.body) {
                try {
                    const bodyObj = JSON.parse(options.body);
                    bodyObj._csrf = this.csrfToken;
                    options.body = JSON.stringify(bodyObj);
                } catch (e) {
                    // 如果无法解析为 JSON，保持原样
                    console.warn('无法在请求体中添加 CSRF Token');
                }
            }
        }

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error('API调用错误:', error);
            throw error;
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new IndustrialPlatform();
});