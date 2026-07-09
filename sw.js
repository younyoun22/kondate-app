// kondate-app Service Worker
// キャッシュ戦略:
//  - index.html / recipes.js / manifest.json: network-first (常に最新を優先、オフライン時のみキャッシュ)
//  - アイコン画像: cache-first
//  - 他オリジン(PokeAPI, jsDelivr等): 素通し・キャッシュしない

const CACHE_NAME = "kondate-v2";

const NETWORK_FIRST_FILES = ["index.html", "recipes.js", "manifest.json"];
const CACHE_FIRST_FILES = ["icon-192.png", "icon-512.png", "apple-touch-icon.png"];

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./recipes.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // オフライン初回インストール等で失敗しても致命的にしない
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function matchesFile(pathname, files) {
  return files.some((f) => pathname === f || pathname.endsWith("/" + f));
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // ブラウザのHTTPキャッシュ(disk cache)による古い応答の再利用を避け、
    // 常にサーバーへ取りに行く(GitHub PagesのCache-Controlに関わらず最新を優先)
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 他オリジン(PokeAPI, jsDelivr等)は素通し。キャッシュしない。
  if (!isSameOrigin(url)) return;

  // ページ遷移(document)リクエスト: network-first、オフライン時はキャッシュ済みindex.htmlを返す
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }

  if (matchesFile(url.pathname, NETWORK_FIRST_FILES)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (matchesFile(url.pathname, CACHE_FIRST_FILES)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // その他の同一オリジンリクエストもnetwork-firstで扱う
  event.respondWith(networkFirst(request));
});
