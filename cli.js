#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "./build.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function fail(msg) {
  throw new Error(msg);
}

function resolveUnderRoot(rootDir, urlPath) {
  if (typeof urlPath !== "string") fail(`无效的请求路径: ${urlPath}`);
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded.replace(/^\/+/, "") || "index.html";
  const root = path.resolve(rootDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    fail(`路径越界: ${urlPath}`);
  }
  return abs;
}

function createHandler(rootDir) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    fail(`静态目录不存在: ${root}`);
  }

  return (req, res) => {
    try {
      let filePath = resolveUnderRoot(root, req.url || "/");
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(e.message || String(e));
    }
  };
}

async function startServer(rootDir, startPort = 4173) {
  if (typeof startPort !== "number" || !Number.isInteger(startPort) || startPort < 1) {
    fail(`无效端口: ${startPort}`);
  }

  const handler = createHandler(rootDir);
  const maxPort = startPort + 100;

  for (let port = startPort; port < maxPort; port++) {
    try {
      const server = await new Promise((resolve, reject) => {
        const s = http.createServer(handler);
        const onError = (err) => {
          s.close(() => reject(err));
        };
        s.once("error", onError);
        s.listen(port, "127.0.0.1", () => {
          s.off("error", onError);
          resolve(s);
        });
      });
      return {
        server,
        port,
        url: `http://127.0.0.1:${port}/`,
      };
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
    }
  }

  fail(`无法绑定本地端口（已尝试 ${startPort}–${maxPort - 1}）`);
}

function openBrowser(url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    fail(`无效的 URL: ${url}`);
  }

  return new Promise((resolve, reject) => {
    const failOpen = (err) => reject(new Error(`打开浏览器失败: ${err.message}`));

    if (process.platform === "win32") {
      execFile("cmd", ["/c", "start", "", url], { windowsHide: true }, (err) => {
        if (err) failOpen(err);
        else resolve();
      });
      return;
    }

    if (process.platform === "darwin") {
      execFile("open", [url], (err) => {
        if (err) failOpen(err);
        else resolve();
      });
      return;
    }

    // Linux：http(s) URL 走浏览器；依次尝试常见命令
    const candidates = [
      "xdg-open",
      "sensible-browser",
      "x-www-browser",
      "firefox",
      "chromium",
      "chromium-browser",
      "google-chrome",
      "google-chrome-stable",
    ];

    const tryNext = (i) => {
      if (i >= candidates.length) {
        reject(new Error("打开浏览器失败: 未找到可用浏览器命令"));
        return;
      }
      execFile(candidates[i], [url], (err) => {
        if (err) tryNext(i + 1);
        else resolve();
      });
    };
    tryNext(0);
  });
}

async function main() {
  const indexHtml = build();
  const dist = path.dirname(indexHtml);
  const { url } = await startServer(dist);

  await openBrowser(url);
  console.log(`本地服务已启动: ${url}`);
  console.log("按 Ctrl+C 退出");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
