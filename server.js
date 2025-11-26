const express = require('express');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const DEFAULT_PORT = 3000;
const MAX_PORT = DEFAULT_PORT + 50;

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 默认路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let server;

function openBrowser(port) {
    const url = `http://localhost:${port}`;

    let command;
    switch (process.platform) {
        case 'darwin': // macOS
            command = `open "${url}"`;
            break;
        case 'win32': // Windows
            command = `start "" "${url}"`;
            break;
        default: // Linux
            command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
        if (error) {
            console.log('请手动打开浏览器访问:', url);
        }
    });
}

function startServer(startPort) {
    const port = startPort;

    server = app.listen(port, 'localhost', () => {
        console.log(`🍌 Nano Banana 服务器已启动: http://localhost:${port}`);
        openBrowser(port);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            const nextPort = port + 1;
            if (nextPort > MAX_PORT) {
                console.error(`端口 ${DEFAULT_PORT}-${MAX_PORT} 都已被占用，请在环境变量 PORT 中手动指定可用端口。`);
                process.exit(1);
            }
            console.warn(`端口 ${port} 已被占用，尝试使用端口 ${nextPort}...`);
            startServer(nextPort);
        } else {
            console.error('服务器启动失败:', err);
            process.exit(1);
        }
    });
}

const initialPort = parseInt(process.env.PORT, 10) || DEFAULT_PORT;
startServer(initialPort);

// 优雅关闭
function gracefulShutdown(signal) {
    console.log(`\n收到信号 ${signal}，正在关闭服务器...`);
    if (server) {
        server.close(() => {
            console.log('服务器已关闭');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

