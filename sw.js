/**
 * 极简 Service Worker：
 * - App Shell（index.html / reader.html / issues.json / manifest.json / pdf-flip.css）
 *   用 "network-first, fallback to cache" —— 保证内容更新能被看到，断网时仍可用。
 * - 已经打开过的 PDF 用 "cache-first" —— 读过的期刊离线也能继续翻。
 * - 其它请求（字体、pdf.js CDN 等）直接透传给浏览器默认处理。
 */
const CACHE_NAME = 'cjar-cache-v1';
const APP_SHELL = ['index.html', 'reader.html', 'issues.json', 'manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isPdf = url.pathname.endsWith('.pdf');
  const isShell = APP_SHELL.some((p) => url.pathname.endsWith(p)) || url.pathname === '/' ;

  if (isPdf) {
    // 读过的 PDF：优先缓存，未命中再去网络并存一份
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }))
    );
    return;
  }

  if (isShell) {
    // App Shell：优先网络拿最新版本，失败（离线）时回退缓存
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
  }
  // 其余请求（跨域字体 / pdf.js CDN 等）不拦截，走浏览器默认逻辑
});
