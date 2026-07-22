import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { marked, Renderer } from "marked";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const INDEX_JSON = path.join(ROOT, "index.json");

function fail(msg) {
  throw new Error(msg);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  if (!fs.existsSync(file)) fail(`找不到配置文件: ${file}`);
  const raw = fs.readFileSync(file, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`index.json 解析失败: ${e.message}`);
  }
  if (!data || !Array.isArray(data.novels)) fail("index.json 缺少 novels 数组");
  return data;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveLocalImage(href, novelId, mdFileDir) {
  if (typeof href !== "string" || !href.trim()) {
    fail(`图片路径无效: ${href}`);
  }
  const raw = href.trim();

  if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) {
    return { external: true, src: raw };
  }

  let absSource;
  if (path.isAbsolute(raw) && fs.existsSync(raw)) {
    absSource = raw;
  } else if (raw.startsWith("/")) {
    const stripped = raw
      .replace(/^\/article\//, "/")
      .replace(/^\//, "");
    absSource = path.join(ROOT, stripped);
  } else {
    absSource = path.resolve(mdFileDir, raw);
  }

  absSource = path.normalize(absSource);
  if (!fs.existsSync(absSource)) {
    fail(`找不到图片文件: ${href} → ${absSource}`);
  }

  const relFromRoot = path.relative(ROOT, absSource);
  if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
    fail(`图片不在项目目录内: ${absSource}`);
  }
  const absDest = path.join(DIST, relFromRoot);
  const htmlRel = path
    .relative(path.join(DIST, novelId), absDest)
    .split(path.sep)
    .join("/");

  return {
    external: false,
    absSource,
    absDest,
    src: htmlRel,
  };
}


function mdToHtml(md, novelId, mdFileDir, imageCopySet) {
  if (typeof md !== "string") fail("章节内容必须是字符串");
  const text = md.replace(/\r\n/g, "\n").trim();
  if (!text) fail("章节内容为空");

  const renderer = new Renderer();
  renderer.image = function (token) {
    const href = token.href;
    const alt = token.text || "张灵韵";
    const title = token.title;
    const resolved = resolveLocalImage(href, novelId, mdFileDir);

    if (!resolved.external) {
      imageCopySet.set(resolved.absSource, resolved.absDest);
    }

    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(resolved.src)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy">`;
  };

  return marked.parse(text, {
    renderer,
    gfm: true,
    breaks: false,
  });
}

function shell(title, body, opts = {}) {
  const {
    rootRel = ".",
    description = "张灵韵小说",
    active = "",
  } = opts;
  const cssHref = `${rootRel}/assets/style.css`.replace(/^\.\//, "");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="author" content="张灵韵">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)} · 张灵韵小说</title>
  <link rel="stylesheet" href="${cssHref}">
</head>
<body data-page="${escapeHtml(active)}">
  <div class="bg-name" aria-hidden="true">张灵韵</div>
  <div class="watermark" aria-hidden="true"></div>
  <div class="page">
    <header class="site-header">
      <a class="brand" href="${rootRel === "." ? "index.html" : "../index.html"}">张灵韵小说</a>
      <span class="brand-sub">作者 · 张灵韵</span>
    </header>
    <main>
${body}
    </main>
    <footer class="site-footer">
      <p>张灵韵小说 · 版权所有 · 作者张灵韵</p>
    </footer>
  </div>
</body>
</html>
`;
}

function buildCss() {
  return `/* 张灵韵小说 · 全局样式 */
:root {
  --bg: #f5e6a8;
  --bg-deep: #edd978;
  --ink: #3a2e0a;
  --ink-soft: #6b5a28;
  --line: #c9b45a;
  --accent: #8a6d1d;
  --card: rgba(255, 248, 220, 0.72);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
  min-height: 100vh;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  color: var(--ink);
  background:
    linear-gradient(180deg, #f8ecc0 0%, var(--bg) 40%, #f0d98a 100%);
  position: relative;
  overflow-x: hidden;
  line-height: 1.75;
}

/* 背景横向大字「张灵韵」 */
.bg-name {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(6rem, 28vw, 18rem);
  font-weight: 900;
  letter-spacing: 0.2em;
  color: rgba(138, 109, 29, 0.07);
  white-space: nowrap;
  user-select: none;
  writing-mode: horizontal-tb;
  transform: translateY(-4%);
}

/* 最上层斜向循环水印，鼠标穿透 */
.watermark {
  position: fixed;
  inset: -50%;
  z-index: 9999;
  pointer-events: none;
  user-select: none;
  background-image: repeating-linear-gradient(
    -28deg,
    transparent 0,
    transparent 72px,
    rgba(90, 70, 10, 0.045) 72px,
    rgba(90, 70, 10, 0.045) 73px
  );
}

.watermark::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='160'%3E%3Ctext x='20' y='90' fill='rgba(90,70,10,0.08)' font-size='18' font-family='sans-serif' transform='rotate(-28 140 80)'%3E作者张灵韵%3C/text%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 280px 160px;
  transform: translate(40px, 20px);
}

.page {
  position: relative;
  z-index: 1;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.site-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
  padding-bottom: 1rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid var(--line);
}

.brand {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--ink);
  text-decoration: none;
  letter-spacing: 0.08em;
}

.brand:hover { color: var(--accent); }

.brand-sub {
  font-size: 0.85rem;
  color: var(--ink-soft);
  letter-spacing: 0.12em;
}

.site-footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  text-align: center;
  font-size: 0.8rem;
  color: var(--ink-soft);
  letter-spacing: 0.06em;
}

h1 {
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  margin-bottom: 0.5rem;
}

h1 .author-mark {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ink-soft);
  letter-spacing: 0.2em;
  margin-bottom: 0.35rem;
}

.lead {
  color: var(--ink-soft);
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.novel-list,
.chapter-list {
  list-style: none;
}

.novel-list li,
.chapter-list li {
  margin-bottom: 0.65rem;
}

.novel-list a,
.chapter-list a {
  display: block;
  padding: 0.85rem 1rem;
  background: var(--card);
  border: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s;
}

.novel-list a:hover,
.chapter-list a:hover {
  background: #fff8dc;
  border-color: var(--accent);
}

.novel-title {
  font-weight: 700;
  font-size: 1.05rem;
}

.novel-meta {
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--ink-soft);
}

.tags {
  margin-top: 0.35rem;
}

.tag {
  display: inline-block;
  margin-right: 0.35rem;
  font-size: 0.75rem;
  color: var(--accent);
}

.crumb {
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin-bottom: 1.25rem;
}

.crumb a {
  color: var(--accent);
  text-decoration: none;
}

.crumb a:hover { text-decoration: underline; }

.article {
  font-size: 1.05rem;
}

.article h1,
.article h2,
.article h3,
.article h4 {
  font-weight: 800;
  letter-spacing: 0.04em;
  margin: 1.75rem 0 0.85rem;
  color: var(--ink);
}

.article h2 { font-size: 1.25rem; }
.article h3 { font-size: 1.1rem; }

.article p {
  margin-bottom: 1.1rem;
  text-indent: 2em;
}

.article p:has(> img:only-child) {
  text-indent: 0;
}

.article img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1rem auto;
}

.article pre {
  margin: 1rem 0 1.25rem;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  background: rgba(58, 46, 10, 0.08);
  border: 1px solid var(--line);
  font-size: 0.9rem;
  line-height: 1.5;
  text-indent: 0;
}

.article code {
  font-family: Consolas, "Courier New", monospace;
  font-size: 0.92em;
}

.article :not(pre) > code {
  padding: 0.1em 0.35em;
  background: rgba(58, 46, 10, 0.08);
  border-radius: 2px;
}

.article blockquote {
  margin: 1rem 0;
  padding: 0.35rem 0 0.35rem 1rem;
  border-left: 3px solid var(--accent);
  color: var(--ink-soft);
}

.article blockquote p {
  text-indent: 0;
}

.article ul,
.article ol {
  margin: 0.75rem 0 1.1rem 1.5rem;
}

.article li {
  margin-bottom: 0.35rem;
}

.article li > p {
  text-indent: 0;
  margin-bottom: 0.35rem;
}

.article hr {
  border: none;
  border-top: 1px solid var(--line);
  margin: 1.5rem 0;
}

.article a {
  color: var(--accent);
}

.nav-chapters {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  font-size: 0.9rem;
}

.nav-chapters a {
  color: var(--accent);
  text-decoration: none;
}

.nav-chapters a:hover { text-decoration: underline; }

.nav-chapters .disabled {
  color: var(--line);
  visibility: hidden;
}

.stamp {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.7rem;
  letter-spacing: 0.25em;
  color: rgba(138, 109, 29, 0.55);
  border: 1px dashed rgba(138, 109, 29, 0.4);
  padding: 0.15rem 0.5rem;
}

@media (max-width: 520px) {
  .page { padding: 1.1rem 0.9rem 2.5rem; }
  h1 { font-size: 1.4rem; }
  .article { font-size: 1rem; }
}
`;
}

function buildHome(novels) {
  const items = novels
    .map((n) => {
      if (!n.id || !n.title) fail("小说缺少 id 或 title");
      const tags = Array.isArray(n.tags)
        ? n.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join("")
        : "";
      const desc = n.description ? escapeHtml(n.description) : "";
      const count = Array.isArray(n.chapters) ? n.chapters.length : 0;
      return `      <li>
        <a href="${escapeHtml(n.id)}/index.html">
          <div class="novel-title">${escapeHtml(n.title)}</div>
          <div class="novel-meta">作者张灵韵 · ${count} 章${desc ? " · " + desc : ""}</div>
          <div class="tags">${tags}</div>
        </a>
      </li>`;
    })
    .join("\n");

  const body = `      <h1><span class="author-mark">作者张灵韵</span>作品目录</h1>
      <p class="lead">张灵韵小说合集 · 共 ${novels.length} 部作品</p>
      <ul class="novel-list">
${items}
      </ul>
      <p class="stamp">张灵韵 · ZHANG LINGYUN</p>`;

  return shell("首页", body, {
    rootRel: ".",
    description: "张灵韵小说合集",
    active: "home",
  });
}

function buildNovelPage(novel) {
  if (!Array.isArray(novel.chapters) || novel.chapters.length === 0) {
    fail(`小说 ${novel.id} 没有章节`);
  }
  const items = novel.chapters
    .map((ch, i) => {
      if (!ch.id || !ch.title || !ch.path) fail(`章节信息不完整: ${novel.id}`);
      return `      <li>
        <a href="${escapeHtml(ch.id)}.html">
          <div class="novel-title">${escapeHtml(ch.title)}</div>
          <div class="novel-meta">张灵韵 · 第 ${i + 1} / ${novel.chapters.length} 篇</div>
        </a>
      </li>`;
    })
    .join("\n");

  const tags = Array.isArray(novel.tags)
    ? novel.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join("")
    : "";

  const body = `      <nav class="crumb"><a href="../index.html">张灵韵小说</a> / ${escapeHtml(novel.title)}</nav>
      <h1><span class="author-mark">作者张灵韵</span>${escapeHtml(novel.title)}</h1>
      <p class="lead">${escapeHtml(novel.description || "")} ${tags}</p>
      <ul class="chapter-list">
${items}
      </ul>
      <p class="stamp">张灵韵作品</p>`;

  return shell(novel.title, body, {
    rootRel: "..",
    description: `${novel.title} · 张灵韵`,
    active: "novel",
  });
}

function buildChapterPage(novel, chapter, index, imageCopySet) {
  const mdPath = path.join(ROOT, novel.id, chapter.path);
  if (!fs.existsSync(mdPath)) fail(`找不到章节文件: ${mdPath}`);
  const md = fs.readFileSync(mdPath, "utf8");
  const mdFileDir = path.dirname(mdPath);
  const htmlContent = mdToHtml(md, novel.id, mdFileDir, imageCopySet);

  const prev = index > 0 ? novel.chapters[index - 1] : null;
  const next = index < novel.chapters.length - 1 ? novel.chapters[index + 1] : null;

  const prevLink = prev
    ? `<a href="${escapeHtml(prev.id)}.html">← ${escapeHtml(prev.title)}</a>`
    : `<span class="disabled">←</span>`;
  const nextLink = next
    ? `<a href="${escapeHtml(next.id)}.html">${escapeHtml(next.title)} →</a>`
    : `<span class="disabled">→</span>`;

  const body = `      <nav class="crumb">
        <a href="../index.html">张灵韵小说</a> /
        <a href="index.html">${escapeHtml(novel.title)}</a> /
        ${escapeHtml(chapter.title)}
      </nav>
      <h1><span class="author-mark">张灵韵 · ${escapeHtml(novel.title)}</span>${escapeHtml(chapter.title)}</h1>
      <article class="article">
${htmlContent}
      </article>
      <nav class="nav-chapters">
        ${prevLink}
        <a href="index.html">目录</a>
        ${nextLink}
      </nav>
      <p class="stamp">作者张灵韵</p>`;

  return shell(`${chapter.title} · ${novel.title}`, body, {
    rootRel: "..",
    description: `${novel.title} ${chapter.title} · 作者张灵韵`,
    active: "chapter",
  });
}

function copyImages(imageCopySet) {
  for (const [src, dest] of imageCopySet) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function rimrafDist() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
}

function main() {
  const data = readJson(INDEX_JSON);
  const novels = data.novels;

  rimrafDist();
  ensureDir(DIST);
  ensureDir(path.join(DIST, "assets"));

  fs.writeFileSync(path.join(DIST, "assets", "style.css"), buildCss(), "utf8");
  fs.writeFileSync(path.join(DIST, "index.html"), buildHome(novels), "utf8");

  let chapterCount = 0;
  const imageCopySet = new Map();

  for (const novel of novels) {
    if (!novel.id) fail("小说缺少 id");
    const novelDir = path.join(DIST, novel.id);
    ensureDir(novelDir);
    fs.writeFileSync(path.join(novelDir, "index.html"), buildNovelPage(novel), "utf8");

    novel.chapters.forEach((ch, i) => {
      const page = buildChapterPage(novel, ch, i, imageCopySet);
      fs.writeFileSync(path.join(novelDir, `${ch.id}.html`), page, "utf8");
      chapterCount += 1;
    });
  }

  copyImages(imageCopySet);

  console.log(
    `完成：${novels.length} 部小说，${chapterCount} 篇文章，${imageCopySet.size} 张图片 → ${DIST}`
  );
}

main();
