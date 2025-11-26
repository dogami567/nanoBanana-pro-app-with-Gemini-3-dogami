#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Nano Banana - nanobanana-pro 多图合成工具
基于 Flask 的本地 Web 服务器，用于打包成独立 exe / app。
"""

import os
import sys
import threading
import webbrowser
import socket
import time
from pathlib import Path

import requests
from flask import Flask, send_from_directory, jsonify, request, Response


# 获取应用目录
if getattr(sys, "frozen", False):
    # 打包后的 exe / app
    app_dir = Path(sys._MEIPASS)
    base_dir = Path(sys.executable).parent
else:
    # 开发环境
    app_dir = Path(__file__).parent
    base_dir = app_dir


app = Flask(
    __name__,
    template_folder=str(app_dir),
    static_folder=str(app_dir),
)


def find_free_port() -> int:
    """查找可用端口"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def open_browser(url: str, delay: float = 1.5) -> None:
    """延迟打开浏览器（跨平台）"""

    def _open():
        time.sleep(delay)
        try:
            import platform

            system = platform.system()

            if system == "Darwin":  # macOS
                os.system(f'open "{url}"')
            elif system == "Windows":
                os.system(f'start "" "{url}"')
            elif system == "Linux":
                os.system(f'xdg-open "{url}"')
            else:
                webbrowser.open(url)
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] 无法自动打开浏览器: {exc}")
            print(f"[INFO] 请手动访问: {url}")

    thread = threading.Thread(target=_open, daemon=True)
    thread.start()


@app.route("/")
def index():
    """主页"""
    return send_from_directory(app_dir, "index.html")


@app.route("/<path:filename>")
def static_files(filename: str):
    """静态文件服务"""
    return send_from_directory(app_dir, filename)


@app.route("/health")
def health_check():
    """健康检查"""
    return jsonify(
        {
            "status": "ok",
            "message": "Nano Banana 服务器运行正常",
            "version": "2.0.0",
        }
    )


@app.route("/api/proxy", methods=["POST"])
def api_proxy():
    """
    简单的后端代理：
    - 接收前端 POST 的 { targetUrl, method, headers, body }
    - 使用 requests 请求远程 API
    - 将响应状态码和内容原样转回前端
    """
    data = request.get_json(silent=True) or {}
    target_url = data.get("targetUrl")
    method = (data.get("method") or "POST").upper()
    headers = data.get("headers") or {}
    body = data.get("body")

    if not target_url:
        return jsonify({"error": "targetUrl is required"}), 400

    # 清理不适合转发的头
    for h in ["host", "Host", "content-length", "Content-Length"]:
        headers.pop(h, None)

    try:
        kwargs = {"headers": headers, "timeout": 120}
        if method != "GET" and body is not None:
            # 我们的调用都是 JSON
            kwargs["json"] = body

        resp = requests.request(method, target_url, **kwargs)

        # 过滤掉会影响 Flask Response 的头
        excluded = {"content-encoding", "transfer-encoding", "connection"}
        response_headers = {
            k: v for k, v in resp.headers.items() if k.lower() not in excluded
        }

        return Response(
            resp.content, status=resp.status_code, headers=response_headers
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] Proxy Error: {exc}")
        return jsonify({"error": str(exc)}), 500


def print_banner() -> None:
    """打印启动横幅"""
    banner = r"""
    ████████   ██  ██████  ██   ██  ████████
    ╚══██╔══   ██ ██    ██ ████ ██ ██╔═════╝
       ██║ ██████ ██    ██ ██╔█ ██ ██║  ███╗
       ██║ ╚════██ ██    ██ ██║╚██ ██║   ╚██
       ██║      ██ ██    ██ ██║ ╚█ ╚███████║
       ╚═╝      ╚═ ╚═    ╚═ ╚═╝  ╚  ╚══════╝

    * NANO BANANA - nanobanana-pro 多图合成工具 v2.0.0
    ===================================================
    """
    print(banner)


def main() -> int:
    """主函数"""
    try:
        print_banner()

        # 检查前端文件是否存在
        required_files = [
            "index.html",
            "script.js",
            "api.js",
            "utils.js",
            "styles.css",
        ]
        missing = [f for f in required_files if not (app_dir / f).exists()]
        if missing:
            print(f"[ERROR] 缺少必要文件: {', '.join(missing)}")
            print("[HINT] 请确认所有前端文件和 exe 在同一目录中。")
            input("按回车键退出...")
            return 1

        port = find_free_port()
        url = f"http://localhost:{port}"

        print("[OK] 文件检查完成")
        print("[INFO] 正在启动本地服务器...")
        print(f"[URL] 服务地址: {url}")
        print("[BROWSER] 浏览器将自动打开")
        print("[STOP] 按 Ctrl+C 停止服务")
        print("=" * 50)

        open_browser(url)

        app.run(
            host="127.0.0.1",
            port=port,
            debug=False,
            threaded=True,
            use_reloader=False,
        )
        return 0
    except KeyboardInterrupt:
        print("\n[EXIT] 感谢使用 Nano Banana")
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] 服务器启动失败: {exc}")
        input("按回车键退出...")
        return 1


if __name__ == "__main__":
    sys.exit(main())

