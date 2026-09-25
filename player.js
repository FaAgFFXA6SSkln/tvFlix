/*!
 * TVWiki HLS Player (2026-09-24 재구현)
 * - relay 모드(every9): /player-stream/ 중계, 키는 원시 16바이트
 * - direct 모드(every1~8): everyN.poorcdn.com 직접, key7?mode=obfuscated JSON 을 Level7 역연산으로 복호화
 * - P2P: Novage p2p-media-loader hls.js 믹스인. 세그먼트(AES-128 암호문)만 피어끼리 공유, 키는 각자 key7 로 받음
 */
(function () {
  'use strict';

  var cfg = window.TVP_CONFIG;
  var root = document.getElementById('tvp');
  var video = document.getElementById('tvp-video');
  if (!cfg || !root || !video) return;

  var BEACON_URL = '/player/api/beacon.php';
  var SOURCE_URL = '/player/api/source.php?id=' + encodeURIComponent(cfg.id);
  var HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js';
  var SEEK_STEP = 10;
  var IDLE_MS = 3000;

  /* WebTorrent 호환 시그널링 트래커 (Novage P2P Media Loader) */
  var P2P_TRACKERS = ['wss://tracker.webtorrent.dev', 'wss://tracker.openwebtorrent.com'];

  var ua = navigator.userAgent;
  var isIOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isMobile = isIOS || /Android|Mobi/i.test(ua);
  var storageKey = 'tvp:pos:' + (cfg.idx || cfg.contentId);

  /* ------------------------------------------------------------------
   * Level7 키 복호화: hls_key_v7.lua obfuscate_key_ultimate() 의 역연산
   * ------------------------------------------------------------------ */
  function b64u(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decodeL7(j) {
    var L = {};
    j.layers.forEach(function (l) { L[l.name] = l; });
    // 7단계: 최종 XOR (패딩은 segment_lengths 합으로 잘라냄)
    var data = b64u(j.encrypted_key), mask = b64u(L.final_encrypt.xor_mask), lens = L.decoy_shuffle.segment_lengths;
    var total = 0, i, k;
    lens.forEach(function (n) { total += n; });
    var comb = new Uint8Array(total);
    for (i = 0; i < total; i++) comb[i] = data[i] ^ mask[i % mask.length];
    // 6단계: 가짜 세그먼트 제거
    var fin = [], off = 0;
    lens.forEach(function (n) { fin.push(comb.subarray(off, off + n)); off += n; });
    var chained = L.decoy_shuffle.real_positions.map(function (p) { return fin[p]; });
    // 5단계: XOR 체인
    var prev = b64u(L.xor_chain.init_key), noisy = [];
    chained.forEach(function (c) {
      var n = new Uint8Array(c.length);
      for (var x = 0; x < c.length; x++) n[x] = c[x] ^ prev[x % prev.length];
      noisy.push(n);
      prev = c.subarray(0, Math.min(4, c.length));
    });
    // 4단계: 노이즈 제거 + 순열 복원
    var p1 = L.segment_noise.perm, l3 = new Uint8Array(16);
    for (i = 0; i < 16; i++) l3[p1[i]] = noisy[i][0];
    // 3단계: 비트 로테이션 복원
    var rots = L.bit_rotate.rotations, l2 = new Uint8Array(16);
    for (i = 0; i < 16; i++) {
      var r = rots[i % rots.length] % 8, b = l3[i];
      l2[i] = ((b >>> r) | (b << (8 - r))) & 255;
    }
    // 2단계: 역 S-Box
    var inv = b64u(L.sbox.inverse_sbox), l1 = new Uint8Array(16);
    for (i = 0; i < 16; i++) l1[i] = inv[l2[i]];
    // 1단계: 비트 인터리빙 복원
    var perm = L.bit_interleave.perm, bits = new Array(128);
    for (i = 0; i < 128; i++) bits[perm[i]] = (l1[i >> 3] >> (7 - (i & 7))) & 1;
    var key = new Uint8Array(16);
    for (i = 0; i < 16; i++) {
      var v = 0;
      for (k = 0; k < 8; k++) v = (v << 1) | bits[i * 8 + k];
      key[i] = v;
    }
    return key;
  }

  function bytesToText(u8) {
    if (window.TextDecoder) return new TextDecoder().decode(u8);
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }

  function toKeyBuffer(data) {
    var u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
    if (u8.length === 16) return u8.buffer.byteLength === 16 ? u8.buffer : u8.slice().buffer;
    var j = JSON.parse(bytesToText(u8));
    if (!j || !j.encrypted_key || !j.layers) throw new Error('unexpected key response');
    return decodeL7(j).buffer;
  }

  function isKeyUrl(url) { return /\/v\/key7\?/.test(url); }

  /* 키는 hls.js 기본 loader, 세그먼트는 P2P fLoader가 담당하도록 분리 */
  function makeLoader(Hls) {
    var Base = Hls.DefaultConfig.loader;
    return class TvpLoader extends Base {
      load(context, config, callbacks) {
        if (isKeyUrl(context.url)) {
          if (cfg.mode === 'direct' && context.url.indexOf('mode=obfuscated') < 0) {
            context.url += (context.url.indexOf('?') < 0 ? '?' : '&') + 'mode=obfuscated';
          }
          var orig = callbacks;
          callbacks = {
            onSuccess: function (response, stats, ctx, net) {
              try {
                response.data = toKeyBuffer(response.data);
              } catch (e) {
                orig.onError({ code: 0, text: 'key decode: ' + e.message }, ctx, net, stats);
                return;
              }
              orig.onSuccess(response, stats, ctx, net);
            },
            onError: orig.onError,
            onTimeout: orig.onTimeout,
            onAbort: orig.onAbort,
            onProgress: orig.onProgress
          };
        }
        super.load(context, config, callbacks);
      }
    };
  }

  /* ------------------------------------------------------------------
   * 집계 비콘
   * ------------------------------------------------------------------ */
  var startedAt = Date.now();
  var sentOk = false;
  var engine = '';

  function beacon(ev, det, code, url, extra) {
    var body = {
      ev: ev, s: cfg.server, mode: cfg.mode, pt: cfg.pathType, eng: engine,
      det: det || '', code: code || 0, url: url ? String(url).replace(/\?.*$/, '') : ''
    };
    if (extra) for (var k in extra) body[k] = extra[k];
    var payload = JSON.stringify(body);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(BEACON_URL, new Blob([payload], { type: 'text/plain' }))) return;
    } catch (e) { /* 무시 */ }
    try { fetch(BEACON_URL, { method: 'POST', body: payload, keepalive: true, headers: { 'Content-Type': 'text/plain' } }); } catch (e) { /* 무시 */ }
  }

  function postParent(message) {
    try { if (window.parent !== window) window.parent.postMessage(message, '*'); } catch (e) { /* 무시 */ }
  }
  function notifyParent(type, extra) {
    var message = { source: 'tvp', type: type, idx: cfg.idx };
    if (extra) for (var key in extra) message[key] = extra[key];
    postParent(message);
  }

  /* ------------------------------------------------------------------
   * P2P (Novage p2p-media-loader)
   * ------------------------------------------------------------------ */
  var P2PEngine = (window.p2pml && window.p2pml.hlsjs && window.p2pml.hlsjs.HlsJsP2PEngine) || null;
  var p2pOk = !!(P2PEngine && window.RTCPeerConnection && window.WebSocket);
  var HlsWithP2P = null;
  var p2pStat = { http: 0, p2p: 0, up: 0, peers: 0 };
  var p2pSessionActive = false;
  var p2pReported = false;

  function p2pStats() {
    var downloaded = p2pStat.http + p2pStat.p2p;
    var ratio = downloaded > 0 ? (p2pStat.p2p / downloaded) * 100 : 0;
    return {
      httpBytes: p2pStat.http,
      p2pBytes: p2pStat.p2p,
      uploadedBytes: p2pStat.up,
      peers: p2pStat.peers,
      active: p2pSessionActive,
      downloadedBytes: downloaded,
      p2pSharePercent: Number(ratio.toFixed(2)),
      httpSavedBytes: p2pStat.p2p
    };
  }
  function p2pMB(bytes) { return Number((bytes / 1048576).toFixed(2)); }
  function logP2PStats() {
    if (!p2pOk) return;
    var s = p2pStats();
    var row = {
      'HTTP 다운로드(MB)': p2pMB(s.httpBytes),
      'P2P 다운로드(MB)': p2pMB(s.p2pBytes),
      '업로드(MB)': p2pMB(s.uploadedBytes),
      '전체 다운로드(MB)': p2pMB(s.downloadedBytes),
      'P2P 분담률(%)': s.p2pSharePercent,
      '피어 연결 이벤트': s.peers,
      '현재 P2P 사용': s.active
    };
    try {
      console.info('[P2P] HTTP 대비 P2P 효율', row);
      if (console.table) console.table([row]);
    } catch (e) { /* 무시 */ }
  }
  window.TVP_P2P = {
    getStats: p2pStats,
    logStats: logP2PStats,
    enabled: p2pOk
  };
  try {
    console.info('[P2P] module=%s WebRTC=%s WebSocket=%s enabled=%s', !!P2PEngine, !!window.RTCPeerConnection, !!window.WebSocket, p2pOk);
  } catch (e) { /* 무시 */ }
  if (p2pOk) window.setInterval(logP2PStats, 10000);

  function p2pOptions() {
    return {
      core: {
        // 사용자별 재생 토큰과 무관하게 같은 콘텐츠가 같은 swarm을 사용하도록 고정
        swarmId: 'tvw-s' + cfg.server + '-' + cfg.pathType + '-' + cfg.contentId,
        announceTrackers: P2P_TRACKERS,
        highDemandTimeWindow: 20,
        httpDownloadTimeWindow: 60,
        p2pDownloadTimeWindow: 900,
        simultaneousHttpDownloads: 2,
        simultaneousP2PDownloads: 4,
        httpDownloadInitialTimeoutMs: 0,
        // 수신 정지는 2초에 감지한다. 요청 세그먼트의 전체 대기 제한은 별도 로더가 처리한다.
        p2pNotReceivingBytesTimeoutMs: 2000,
        // 한 세그먼트 실패는 HTTP로 넘기되, 다른 세그먼트의 P2P는 계속 유지한다.
        p2pErrorRetries: 3,
        segmentMemoryStorageLimit: isMobile ? 512 : 2048,
        // 206 Partial Content가 브라우저 디스크 캐시에 남아 다른 재생과 섞이지 않게 한다.
        httpRequestSetup: function (url, byteRange, signal, requestByteRange) {
          var range = requestByteRange || byteRange;
          var headers = {};
          if (range && range.start !== undefined) headers.Range = 'bytes=' + range.start + '-' + (range.end === undefined ? '' : range.end);
          var init = { cache: 'no-store', headers: headers };
          if (signal) init.signal = signal;
          return new Request(url, init);
        }
      },
      onHlsJsCreated: function (h) {
        var eng = h.p2pEngine;
        if (!eng) return;
        eng.addEventListener('onChunkDownloaded', function (bytes, src) {
          if (src === 'p2p') p2pStat.p2p += bytes; else p2pStat.http += bytes;
        });
        eng.addEventListener('onChunkUploaded', function (bytes) { p2pStat.up += bytes; });
        eng.addEventListener('onPeerConnect', function (params) {
          p2pStat.peers++;
          try { console.info('[P2P] peer connected', params && params.peerId || ''); } catch (e) { /* 무시 */ }
        });
      }
    };
  }

  function reportP2P() {
    if (p2pReported || !p2pOk) return;
    if (p2pStat.http + p2pStat.p2p + p2pStat.up < 1024) return;
    p2pReported = true;
    beacon('p2p', p2pStat.peers ? 'peers' : 'alone', 0, '', {
      h: Math.round(p2pStat.http / 1024), p: Math.round(p2pStat.p2p / 1024),
      u: Math.round(p2pStat.up / 1024), peers: p2pStat.peers
    });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') reportP2P(); });
  window.addEventListener('pagehide', reportP2P);

  /* ------------------------------------------------------------------
   * UI
   * ------------------------------------------------------------------ */
  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><text x="12" y="16.2" font-size="6.5" font-weight="700" text-anchor="middle">10</text></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/><text x="12" y="16.2" font-size="6.5" font-weight="700" text-anchor="middle">10</text></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    pip: '<svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>',
    fs: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    fsExit: '<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
  };
  var CAST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 18v3h3v-3H1zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c5.52 0 10 4.48 10 10h2c0-6.63-5.37-12-12-12zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-5v2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>';
  var AIRPLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 22h12l-6-6-6 6zm-4-4h2V5h16v13h2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v13zm10 0 4 4H8l4-4z"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  root.insertAdjacentHTML('beforeend',
    '<div class="tvp-hit" style="position:absolute;inset:0;z-index:1"></div>' +
    '<div class="tvp-seekfx is-left">-' + SEEK_STEP + '초</div><div class="tvp-seekfx is-right">+' + SEEK_STEP + '초</div>' +
    '<div class="tvp-top">' + esc(cfg.title || '') + '</div>' +
    '<button class="tvp-center" type="button" aria-label="재생">' + ICON.play + '</button>' +
    '<div class="tvp-spin"></div>' +
    '<div class="tvp-toast"><span class="tvp-toast-text"></span><button type="button" class="tvp-toast-btn"></button></div>' +
    '<div class="tvp-menu" role="menu"></div>' +
    '<div class="tvp-bottom">' +
      '<div class="tvp-progress"><div class="tvp-rail"><div class="tvp-buffered"></div><div class="tvp-played"></div><div class="tvp-knob"></div></div><div class="tvp-tip">0:00</div></div>' +
      '<div class="tvp-row">' +
        '<button class="tvp-btn tvp-play" type="button" aria-label="재생">' + ICON.play + '</button>' +
        '<button class="tvp-btn tvp-back" type="button" aria-label="10초 뒤로">' + ICON.back + '</button>' +
        '<button class="tvp-btn tvp-fwd" type="button" aria-label="10초 앞으로">' + ICON.fwd + '</button>' +
        '<div class="tvp-vol"><button class="tvp-btn tvp-mute" type="button" aria-label="음소거">' + ICON.vol + '</button><input class="tvp-volume" type="range" min="0" max="1" step="0.05" aria-label="볼륨"></div>' +
        '<span class="tvp-time">0:00 / 0:00</span>' +
        '<span class="tvp-spacer"></span>' +
        '<button class="tvp-btn tvp-speed" type="button" aria-label="재생 속도">1x</button>' +
        '<button class="tvp-btn tvp-pip tvp-hide-sm" type="button" aria-label="PIP" hidden>' + ICON.pip + '</button>' +
        '<button class="tvp-btn tvp-cast" type="button" aria-label="크롬캐스트" title="크롬캐스트" hidden>' + CAST_ICON + '</button>' +
        '<button class="tvp-btn tvp-airplay" type="button" aria-label="AirPlay" title="AirPlay" hidden>' + AIRPLAY_ICON + '</button>' +
        '<button class="tvp-btn tvp-fs" type="button" aria-label="전체화면">' + ICON.fs + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="tvp-next" aria-live="polite">' +
      '<div class="tvp-next-head"><span>다음화</span><button type="button" class="tvp-next-close" aria-label="다음화 자동재생 취소">×</button></div>' +
      '<div class="tvp-next-body"><img class="tvp-next-thumb" alt=""><div class="tvp-next-info"><strong class="tvp-next-title"></strong><span><b class="tvp-next-count">10</b>초 후 자동 재생</span></div></div>' +
      '<div class="tvp-next-actions"><button type="button" class="tvp-next-play">지금 재생</button><button type="button" class="tvp-next-cancel">취소</button></div>' +
      '<div class="tvp-next-progress"><i></i></div>' +
    '</div>' +
    '<div class="tvp-msg"><div class="tvp-msg-box"><p class="tvp-msg-text"></p><button type="button" class="tvp-retry">다시 시도</button><small class="tvp-msg-code"></small></div></div>'
  );

  function $(sel) { return root.querySelector(sel); }
  var ui = {
    hit: $('.tvp-hit'), center: $('.tvp-center'), play: $('.tvp-play'), back: $('.tvp-back'), fwd: $('.tvp-fwd'),
    mute: $('.tvp-mute'), volume: $('.tvp-volume'), time: $('.tvp-time'), speed: $('.tvp-speed'), pip: $('.tvp-pip'),
    top: $('.tvp-top'), fs: $('.tvp-fs'), cast: $('.tvp-cast'), airplay: $('.tvp-airplay'), progress: $('.tvp-progress'), buffered: $('.tvp-buffered'), played: $('.tvp-played'),
    knob: $('.tvp-knob'), tip: $('.tvp-tip'), menu: $('.tvp-menu'), toast: $('.tvp-toast'),
    toastText: $('.tvp-toast-text'), toastBtn: $('.tvp-toast-btn'), msgText: $('.tvp-msg-text'),
    msgCode: $('.tvp-msg-code'), retry: $('.tvp-retry'), fxL: $('.tvp-seekfx.is-left'), fxR: $('.tvp-seekfx.is-right'),
    next: $('.tvp-next'), nextClose: $('.tvp-next-close'), nextThumb: $('.tvp-next-thumb'), nextTitle: $('.tvp-next-title'),
    nextCount: $('.tvp-next-count'), nextPlay: $('.tvp-next-play'), nextCancel: $('.tvp-next-cancel'), nextProgress: $('.tvp-next-progress i')
  };

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.floor(t);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setClass(name, on) { root.classList.toggle(name, !!on); }

  /* ------------------------------------------------------------------
   * 다음화 자동재생
   * 부모 페이지가 다음 회차의 메타데이터를 postMessage로 보내고,
   * 실제 전환 때는 새 HLS 토큰을 다시 받아 같은 video 요소에 교체한다.
   * 따라서 iframe·전체화면은 유지되고, 다음 회차도 새 P2P swarm을 사용한다.
   * ------------------------------------------------------------------ */
  var nextEpisode = null;
  var nextOverlayShown = false;
  var nextAutoplayCancelled = false;
  var nextCountdownTimer = null;
  var nextCountdownSeconds = 10;
  var nextSwitching = false;
  var nextFreshWait = null;

  function clearNextCountdown() {
    if (nextCountdownTimer) clearInterval(nextCountdownTimer);
    nextCountdownTimer = null;
  }

  function hideNextOverlay(cancelled) {
    clearNextCountdown();
    nextOverlayShown = false;
    if (cancelled) nextAutoplayCancelled = true;
    if (ui.next) ui.next.classList.remove('is-show');
  }

  function showNextOverlay() {
    if (!nextEpisode || nextOverlayShown || nextAutoplayCancelled || nextSwitching || !ui.next) return;
    nextOverlayShown = true;
    nextCountdownSeconds = 10;
    ui.nextTitle.textContent = nextEpisode.title || '다음 회차';
    ui.nextCount.textContent = String(nextCountdownSeconds);
    ui.nextProgress.style.width = '0%';
    if (nextEpisode.thumb) {
      ui.nextThumb.src = nextEpisode.thumb;
      ui.nextThumb.style.display = '';
    } else {
      ui.nextThumb.removeAttribute('src');
      ui.nextThumb.style.display = 'none';
    }
    ui.next.classList.add('is-show');
    clearNextCountdown();
    nextCountdownTimer = setInterval(function () {
      nextCountdownSeconds--;
      if (nextCountdownSeconds <= 0) {
        clearNextCountdown();
        playNextEpisode('countdown');
        return;
      }
      ui.nextCount.textContent = String(nextCountdownSeconds);
      ui.nextProgress.style.width = String((10 - nextCountdownSeconds) * 10) + '%';
    }, 1000);
  }

  function normalizeNextEpisode(data) {
    if (!data || data.idx === undefined || data.idx === null || String(data.idx) === '') return null;
    return {
      idx: String(data.idx),
      url: data.url ? String(data.url) : '',
      title: data.title ? String(data.title) : '다음 회차',
      thumb: data.thumb ? String(data.thumb) : '',
      hlsUrl: data.hlsUrl ? String(data.hlsUrl) : '',
      srt: data.srt ? String(data.srt) : '',
      vtt: data.vtt ? String(data.vtt) : ''
    };
  }

  function setNextEpisode(data) {
    hideNextOverlay(false);
    nextAutoplayCancelled = false;
    nextEpisode = normalizeNextEpisode(data);
  }

  function sendFreshNextRequest(ep) {
    if (window.parent === window) {
      if (ep.hlsUrl) return Promise.resolve({ hlsUrl: ep.hlsUrl, idx: ep.idx, title: ep.title, url: ep.url });
      return Promise.reject(new Error('parent unavailable'));
    }
    if (nextFreshWait) {
      try { nextFreshWait.reject(new Error('superseded')); } catch (e) { /* 무시 */ }
      clearTimeout(nextFreshWait.timer);
      nextFreshWait = null;
    }
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        if (!nextFreshWait || nextFreshWait.idx !== ep.idx) return;
        nextFreshWait = null;
        reject(new Error('fresh HLS timeout'));
      }, 7000);
      nextFreshWait = { idx: ep.idx, resolve: resolve, reject: reject, timer: timer };
      postParent({
        source: 'tvp', type: 'requestFreshHlsUrl', idx: ep.idx,
        title: ep.title, url: ep.url
      });
    });
  }

  function updateEpisodeConfig(ep, src) {
    cfg.idx = ep.idx;
    cfg.src = src;
    if (ep.title) cfg.title = ep.title;
    if (ui.top) ui.top.textContent = cfg.title || '';
    storageKey = 'tvp:pos:' + (cfg.idx || cfg.contentId);
    resumeAt = 0;
    try {
      var parsed = new URL(src, window.location.href);
      var hostMatch = parsed.hostname.match(/every([1-9])(?:\.|$)/i);
      var pathMatch = parsed.pathname.match(/\/v\/([a-z])\/([A-Za-z0-9]{8,64})\//i);
      if (hostMatch) cfg.server = hostMatch[1];
      if (pathMatch) {
        cfg.pathType = pathMatch[1].toLowerCase();
        cfg.contentId = pathMatch[2];
      }
    } catch (e) { /* URL 형식은 HLS 로더가 최종 검증 */ }
  }

  function goToNextEpisode(ep) {
    if (!ep || !ep.url) return;
    if (window.parent !== window) postParent({ source: 'tvp', type: 'goNextEpisode', idx: ep.idx, url: ep.url });
    else window.location.href = ep.url;
  }

  function playNextEpisode(reason) {
    if (nextSwitching || !nextEpisode) return;
    var ep = nextEpisode;
    nextSwitching = true;
    nextEpisode = null;
    hideNextOverlay(false);
    setClass('is-error', false);
    setClass('is-loading', true);
    failed = false;
    sourceRetry = 0;
    netRetry = 0;
    mediaRecover = 0;
    triedNativeFallback = false;

    sendFreshNextRequest(ep).then(function (fresh) {
      var src = fresh && fresh.hlsUrl;
      if (!src) throw new Error('next HLS source empty');
      updateEpisodeConfig(ep, src);
      notifyParent('updatePageState', { idx: ep.idx, url: ep.url, title: ep.title });
      if (engine === 'native') startNative(src, -1);
      else startHls(src, -1);
      firstPlay = true;
      toast(ep.title + ' 재생 중', '', null, 3000);
    }).catch(function (err) {
      try { console.warn('[Next episode] source switch failed', reason || '', err); } catch (e) { /* 무시 */ }
      goToNextEpisode(ep);
    }).then(function () {
      nextSwitching = false;
    });
  }

  ui.nextClose.addEventListener('click', function (e) { e.stopPropagation(); hideNextOverlay(true); });
  ui.nextCancel.addEventListener('click', function (e) { e.stopPropagation(); hideNextOverlay(true); });
  ui.nextPlay.addEventListener('click', function (e) {
    e.stopPropagation();
    nextAutoplayCancelled = false;
    playNextEpisode('manual');
  });

  window.addEventListener('message', function (e) {
    var data = e && e.data;
    if (!data || !data.type) return;
    if (window.parent !== window && e.source !== window.parent) return;
    if (data.type === 'nextEpisodeInfo') {
      setNextEpisode(data);
      return;
    }
    if (data.type === 'freshHlsUrl' && nextFreshWait && String(data.idx) === String(nextFreshWait.idx)) {
      var wait = nextFreshWait;
      nextFreshWait = null;
      clearTimeout(wait.timer);
      wait.resolve(data);
      return;
    }
    if (data.type === 'updateTitle' && data.title) {
      cfg.title = String(data.title);
      if (ui.top) ui.top.textContent = cfg.title;
    }
  });

  /* 컨트롤 자동 숨김 */
  var idleTimer = null;
  function wake() {
    setClass('is-idle', false);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (!video.paused && !ui.menu.classList.contains('is-open') && !ui.progress.classList.contains('is-drag')) setClass('is-idle', true);
    }, IDLE_MS);
  }
  root.addEventListener('mousemove', wake);
  root.addEventListener('touchstart', function () { setClass('is-touch', true); }, { passive: true });

  /* 재생 / 일시정지 */
  function playSafe() {
    var p = video.play();
    if (p && p.catch) p.catch(function () { setClass('is-paused', true); setClass('is-loading', false); });
  }
  function togglePlay() {
    if (video.paused || video.ended) playSafe(); else video.pause();
  }
  function syncPlayIcon() {
    var paused = video.paused;
    ui.play.innerHTML = paused ? ICON.play : ICON.pause;
    ui.play.setAttribute('aria-label', paused ? '재생' : '일시정지');
    setClass('is-paused', paused);
    if (paused) setClass('is-idle', false); else wake();
  }
  video.addEventListener('play', syncPlayIcon);
  video.addEventListener('pause', syncPlayIcon);
  ui.center.addEventListener('click', function (e) { e.stopPropagation(); playSafe(); });
  ui.play.addEventListener('click', function (e) { e.stopPropagation(); togglePlay(); });

  /* 탐색 */
  function seekTo(t) {
    if (!isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 0.5, t));
    renderTime();
  }
  function seekBy(d) {
    seekTo(video.currentTime + d);
    var fx = d < 0 ? ui.fxL : ui.fxR;
    fx.classList.add('is-show');
    setTimeout(function () { fx.classList.remove('is-show'); }, 450);
    wake();
  }
  ui.back.addEventListener('click', function (e) { e.stopPropagation(); seekBy(-SEEK_STEP); });
  ui.fwd.addEventListener('click', function (e) { e.stopPropagation(); seekBy(SEEK_STEP); });

  /* 화면 탭/클릭: 데스크톱은 재생 토글, 터치는 컨트롤 표시 + 더블탭 ±10초 */
  var lastTap = 0, tapTimer = null;
  ui.hit.addEventListener('click', function (e) {
    closeMenu();
    if (!root.classList.contains('is-touch')) { togglePlay(); wake(); return; }
    var now = Date.now(), x = e.clientX / (root.clientWidth || 1);
    if (now - lastTap < 300) {
      clearTimeout(tapTimer);
      lastTap = 0;
      if (x < 0.4) seekBy(-SEEK_STEP); else if (x > 0.6) seekBy(SEEK_STEP); else togglePlay();
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(function () {
      if (root.classList.contains('is-idle') || video.paused) wake();
      else { clearTimeout(idleTimer); setClass('is-idle', true); }
    }, 300);
  });
  ui.hit.addEventListener('dblclick', function () {
    if (!root.classList.contains('is-touch')) toggleFullscreen();
  });

  /* 진행바 */
  function renderTime() {
    var d = video.duration, t = video.currentTime;
    var pct = isFinite(d) && d > 0 ? (t / d) * 100 : 0;
    if (!ui.progress.classList.contains('is-drag')) {
      ui.played.style.width = pct + '%';
      ui.knob.style.left = pct + '%';
    }
    ui.time.textContent = fmt(t) + ' / ' + fmt(d);
  }
  function renderBuffered() {
    var d = video.duration, b = video.buffered, end = 0;
    if (!isFinite(d) || d <= 0) return;
    for (var i = 0; i < b.length; i++) {
      if (b.start(i) <= video.currentTime + 1) end = Math.max(end, b.end(i));
    }
    ui.buffered.style.width = (end / d) * 100 + '%';
  }
  video.addEventListener('timeupdate', renderTime);
  video.addEventListener('durationchange', renderTime);
  video.addEventListener('progress', renderBuffered);
  video.addEventListener('timeupdate', renderBuffered);

  function ratioAt(clientX) {
    var r = ui.progress.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
  }
  function showTip(ratio) {
    ui.tip.textContent = fmt(ratio * (video.duration || 0));
    var r = ui.progress.getBoundingClientRect(), half = ui.tip.offsetWidth / 2;
    ui.tip.style.left = Math.max(half, Math.min(r.width - half, ratio * r.width)) + 'px';
  }
  ui.progress.addEventListener('pointermove', function (e) {
    var ratio = ratioAt(e.clientX);
    showTip(ratio);
    if (ui.progress.classList.contains('is-drag')) {
      ui.played.style.width = ratio * 100 + '%';
      ui.knob.style.left = ratio * 100 + '%';
    }
  });
  ui.progress.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    ui.progress.classList.add('is-drag');
    try { ui.progress.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    var ratio = ratioAt(e.clientX);
    ui.played.style.width = ratio * 100 + '%';
    ui.knob.style.left = ratio * 100 + '%';
    showTip(ratio);
    wake();
  });
  function endDrag(e) {
    if (!ui.progress.classList.contains('is-drag')) return;
    ui.progress.classList.remove('is-drag');
    seekTo(ratioAt(e.clientX) * (video.duration || 0));
    wake();
  }
  ui.progress.addEventListener('pointerup', endDrag);
  ui.progress.addEventListener('pointercancel', function () { ui.progress.classList.remove('is-drag'); renderTime(); });

  /* 볼륨 (localStorage 는 막힐 수 있어 try) */
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (e) { /* 무시 */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  var savedVol = parseFloat(load('tvp:vol'));
  if (isFinite(savedVol)) video.volume = Math.max(0, Math.min(1, savedVol));
  if (load('tvp:muted') === '1') video.muted = true;
  function syncVolume() {
    var muted = video.muted || video.volume === 0;
    ui.mute.innerHTML = muted ? ICON.mute : ICON.vol;
    ui.volume.value = video.muted ? 0 : video.volume;
    store('tvp:vol', video.volume);
    store('tvp:muted', video.muted ? '1' : '0');
  }
  video.addEventListener('volumechange', syncVolume);
  ui.mute.addEventListener('click', function (e) {
    e.stopPropagation();
    if (video.muted || video.volume === 0) { video.muted = false; if (video.volume === 0) video.volume = 0.5; } else video.muted = true;
  });
  ui.volume.addEventListener('input', function () {
    video.volume = parseFloat(ui.volume.value);
    video.muted = video.volume === 0;
  });
  ui.volume.addEventListener('click', function (e) { e.stopPropagation(); });
  syncVolume();

  /* 재생 속도 */
  var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  function closeMenu() { ui.menu.classList.remove('is-open'); }
  ui.speed.addEventListener('click', function (e) {
    e.stopPropagation();
    if (ui.menu.classList.contains('is-open')) { closeMenu(); return; }
    ui.menu.innerHTML = SPEEDS.map(function (s) {
      return '<button type="button" data-speed="' + s + '"' + (video.playbackRate === s ? ' class="is-on"' : '') + '>' + (s === 1 ? '보통' : s + 'x') + '</button>';
    }).join('');
    ui.menu.classList.add('is-open');
    wake();
  });
  ui.menu.addEventListener('click', function (e) {
    e.stopPropagation();
    var s = e.target && e.target.getAttribute('data-speed');
    if (!s) return;
    video.playbackRate = parseFloat(s);
    closeMenu();
  });
  video.addEventListener('ratechange', function () { ui.speed.textContent = video.playbackRate + 'x'; });

  /* PIP */
  if ((document.pictureInPictureEnabled && !video.disablePictureInPicture) ||
      (video.webkitSupportsPresentationMode && video.webkitSupportsPresentationMode('picture-in-picture'))) {
    ui.pip.hidden = false;
  }
  ui.pip.addEventListener('click', function (e) {
    e.stopPropagation();
    try {
      if (document.pictureInPictureElement) document.exitPictureInPicture();
      else if (video.requestPictureInPicture) video.requestPictureInPicture();
      else if (video.webkitSetPresentationMode) video.webkitSetPresentationMode(video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    } catch (err) { /* 무시 */ }
  });

  /* AirPlay (Safari / WebKit) */
  function syncAirPlay(available) {
    if (!ui.airplay) return;
    var supported = typeof video.webkitShowPlaybackTargetPicker === 'function';
    ui.airplay.hidden = !(supported && available !== false);
    ui.airplay.classList.toggle('is-on', !!video.webkitCurrentPlaybackTargetIsWireless);
  }
  syncAirPlay(false);
  video.addEventListener('webkitplaybacktargetavailabilitychanged', function (e) {
    syncAirPlay(e && e.availability === 'available');
  });
  video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', function () {
    syncAirPlay(true);
    try { beacon('cast', video.webkitCurrentPlaybackTargetIsWireless ? 'airplay_start' : 'airplay_stop'); } catch (e) { /* 무시 */ }
  });
  ui.airplay.addEventListener('click', function (e) {
    e.stopPropagation();
    try {
      if (typeof video.webkitShowPlaybackTargetPicker === 'function') video.webkitShowPlaybackTargetPicker();
    } catch (err) {
      try { console.warn('[AirPlay] picker failed', err); } catch (e) { /* 무시 */ }
    }
  });

  /* 전체화면 (아이폰은 요소 전체화면이 없어 video 네이티브 전체화면) */
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function toggleFullscreen() {
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req) {
      var p = req.call(root);
      if (p && p.then) p.then(function () {
        try { if (screen.orientation && screen.orientation.lock && root.classList.contains('is-touch')) screen.orientation.lock('landscape').catch(function () {}); } catch (e) { /* 무시 */ }
      }).catch(function () { if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); });
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  }
  function syncFs() { ui.fs.innerHTML = fsElement() ? ICON.fsExit : ICON.fs; }
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);
  ui.fs.addEventListener('click', function (e) { e.stopPropagation(); toggleFullscreen(); });

  /* Chromecast (기본 미디어 리시버) */
  var castContext = null;
  var castSession = null;
  var castConfigured = false;
  var castLoading = false;
  function syncCastButton() {
    if (!ui.cast) return;
    var state = '';
    try { state = castContext && cast.framework && cast.framework.CastState && castContext.getCastState(); } catch (e) { state = ''; }
    // Cast SDK가 없는 환경에서는 버튼을 표시하지 않는다. 기기가 검색되면 자동으로 표시된다.
    ui.cast.hidden = !castConfigured || (state === 'NO_DEVICES_AVAILABLE' && !castSession);
    ui.cast.classList.toggle('is-on', !!castSession);
    ui.cast.setAttribute('aria-label', castSession ? '크롬캐스트 중지' : '크롬캐스트');
  }
  function castMediaUrl() {
    // c.html은 토큰이 붙은 HLS 진입점이라 Cast 기본 리시버도 그대로 재생할 수 있다.
    return String(cfg.src || '');
  }
  function loadCastMedia(session) {
    if (!session || !window.chrome || !chrome.cast || !chrome.cast.media) return Promise.reject(new Error('Cast SDK unavailable'));
    var info = new chrome.cast.media.MediaInfo(castMediaUrl(), 'application/x-mpegURL');
    info.streamType = chrome.cast.media.StreamType.BUFFERED;
    var meta = new chrome.cast.media.GenericMediaMetadata();
    meta.title = String(cfg.title || 'TVWiki');
    info.metadata = meta;
    info.customData = { tvp: true, id: String(cfg.id || '') };
    var req = new chrome.cast.media.LoadRequest(info);
    req.currentTime = isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;
    return session.loadMedia(req);
  }
  function setupCast() {
    if (castConfigured || !window.cast || !cast.framework || !window.chrome || !chrome.cast) return;
    try {
      castContext = cast.framework.CastContext.getInstance();
      castContext.setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
      });
      castConfigured = true;
      castContext.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, syncCastButton);
      castContext.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, function (e) {
        var started = e && (e.sessionState === cast.framework.SessionState.SESSION_STARTED || e.sessionState === cast.framework.SessionState.SESSION_RESUMED);
        var ended = e && e.sessionState === cast.framework.SessionState.SESSION_ENDED;
        if (started) castSession = castContext.getCurrentSession();
        if (ended) castSession = null;
        syncCastButton();
      });
      syncCastButton();
    } catch (e) {
      castConfigured = false;
    }
  }
  function castClick(e) {
    e.stopPropagation();
    setupCast();
    if (!castContext || castLoading) return;
    if (castSession) {
      try { castContext.endCurrentSession(true); } catch (err) { /* 무시 */ }
      castSession = null;
      syncCastButton();
      beacon('cast', 'stop');
      return;
    }
    castLoading = true;
    castContext.requestSession().then(function () {
      castSession = castContext.getCurrentSession();
      return loadCastMedia(castSession);
    }).then(function () {
      video.pause();
      beacon('cast', 'start');
      toast('크롬캐스트로 재생 중입니다', '', null, 3500);
    }).catch(function (err) {
      try { console.warn('[Cast] load failed', err); } catch (e) { /* 무시 */ }
      toast('크롬캐스트를 연결하지 못했습니다', '', null, 4500);
      beacon('cast', 'load_err', 0, '');
    }).then(function () {
      castLoading = false;
      syncCastButton();
    });
  }
  if (ui.cast) {
    ui.cast.addEventListener('click', castClick);
    window.addEventListener('tvp-cast-api', setupCast);
    setupCast();
  }

  /* 키보드 */
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); togglePlay(); }
    else if (k === 'ArrowLeft' || k === 'j' || k === 'J') { e.preventDefault(); seekBy(-SEEK_STEP); }
    else if (k === 'ArrowRight' || k === 'l' || k === 'L') { e.preventDefault(); seekBy(SEEK_STEP); }
    else if (k === 'ArrowUp') { e.preventDefault(); video.muted = false; video.volume = Math.min(1, video.volume + 0.1); }
    else if (k === 'ArrowDown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); }
    else if (k === 'f' || k === 'F') { e.preventDefault(); toggleFullscreen(); }
    else if (k === 'm' || k === 'M') { e.preventDefault(); video.muted = !video.muted; }
    else return;
    wake();
  });

  /* 이어보기 */
  var resumeAt = parseFloat(load(storageKey)) || 0;
  var lastSave = 0;
  video.addEventListener('timeupdate', function () {
    var now = Date.now();
    if (now - lastSave < 5000) return;
    lastSave = now;
    var d = video.duration, t = video.currentTime;
    if (!isFinite(d) || t < 10) return;
    if (d - t < 30) store(storageKey, null); else store(storageKey, Math.floor(t));
  });
  video.addEventListener('timeupdate', function () {
    if (!nextEpisode || nextOverlayShown || nextAutoplayCancelled || nextSwitching) return;
    var remaining = video.duration - video.currentTime;
    if (isFinite(remaining) && remaining > 0 && remaining <= 10) showNextOverlay();
  });
  video.addEventListener('ended', function () {
    store(storageKey, null);
    if (nextEpisode && !nextAutoplayCancelled && !nextSwitching) {
      playNextEpisode('ended');
      return;
    }
    notifyParent('ended');
  });

  var toastTimer = null;
  function toast(text, btnText, onBtn, ms) {
    ui.toastText.textContent = text;
    ui.toastBtn.textContent = btnText || '';
    ui.toastBtn.style.display = btnText ? '' : 'none';
    ui.toastBtn.onclick = function (e) { e.stopPropagation(); ui.toast.classList.remove('is-show'); if (onBtn) onBtn(); };
    ui.toast.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.classList.remove('is-show'); }, ms || 6000);
  }

/* 로딩 상태 */
setClass('is-paused', true);
setClass('is-loading', true);

video.addEventListener('waiting', function () {
  setClass('is-loading', true);
});

video.addEventListener('seeking', function () {
  setClass('is-loading', true);
});

/* 동영상 재생 준비 완료 */
var videoReadySent = false;

video.addEventListener('canplay', function () {
  setClass('is-loading', false);

  if (videoReadySent) return;
  if (video.readyState < 3) return;

  videoReadySent = true;

  window.top.postMessage({
    action: 'VIDEO_READY'
  }, '*');
});

['playing', 'seeked', 'pause'].forEach(function (ev) {
  video.addEventListener(ev, function () {
    if (ev !== 'pause' || video.readyState >= 3) {
      setClass('is-loading', false);
    }
  });
});

var firstPlay = true;
video.addEventListener('playing', function () {
  setClass('is-error', false);
  
      if (!fsElement()) {
        toggleFullscreen();
    }

  if (!firstPlay) return;
  firstPlay = false;

  if (!sentOk) {
    sentOk = true;
    var ms = Date.now() - startedAt;
    beacon('ok', ms < 2000 ? 'lt2s' : ms < 5000 ? 'lt5s' : ms < 10000 ? 'lt10s' : 'ge10s');
  }

  notifyParent('playing');

  if (resumeAt > 30 && Math.abs(video.currentTime - resumeAt) < 15) {
    toast(
      fmt(resumeAt) + '부터 이어서 재생합니다',
      '처음부터',
      function () { seekTo(0); }
    );
  }
});

  /* ------------------------------------------------------------------
   * 오류 표시 / 재시도
   * ------------------------------------------------------------------ */
  var failed = false;
  function fail(det, code, url) {
    if (failed) return;
    failed = true;
    setClass('is-error', true);
    setClass('is-loading', false);
    ui.msgText.textContent = code === 410 ? '재생 시간이 만료되었습니다. 페이지를 새로고침해 주세요.' : '영상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    ui.retry.style.display = code === 410 ? 'none' : '';
    ui.msgCode.textContent = 'S' + cfg.server + ' · ' + (det || 'error') + (code ? ' · ' + code : '');
    beacon('err', det, code, url);
  }

  function refreshSource() {
    return fetch(SOURCE_URL, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
      if (r.status === 410) { var e = new Error('expired'); e.code = 410; throw e; }
      if (!r.ok) { var e2 = new Error('source ' + r.status); e2.code = r.status; throw e2; }
      return r.json();
    }).then(function (j) {
      if (!j || !j.src) throw new Error('source empty');
      cfg.src = j.src;
      if (j.iosOld) cfg.iosOld = j.iosOld;
      return j.src;
    });
  }

  var hls = null;
  var HlsLib = null;
  var netRetry = 0, mediaRecover = 0, sourceRetry = 0;

  function reloadFromFreshSource(det, code, url) {
    if (sourceRetry >= 2) { fail(det, code, url); return; }
    sourceRetry++;
    setClass('is-loading', true);
    var pos = video.currentTime || 0;
    refreshSource().then(function (src) {
      if (engine === 'hls') startHls(src, pos > 1 ? pos : -1);
      else startNative(src, pos);
    }).catch(function (e) { fail(det || 'source', e.code || code, url); });
  }

  ui.retry.addEventListener('click', function (e) {
    e.stopPropagation();
    failed = false;
    sourceRetry = 0; netRetry = 0; mediaRecover = 0;
    setClass('is-error', false);
    reloadFromFreshSource('retry');
  });

  /* ------------------------------------------------------------------
   * 엔진
   * ------------------------------------------------------------------ */
  function destroyHls() {
    p2pSessionActive = false;
    if (!hls) return;
    try { if (hls.p2pEngine) hls.p2pEngine.destroy(); } catch (e) { /* 무시 */ }
    try { hls.destroy(); } catch (e) { /* 무시 */ }
    hls = null;
  }

  function startHls(src, startPos) {
    engine = 'hls';
    destroyHls();
    // AirPlay를 허용한다. P2P를 사용하는 HLS 재생에서도 Safari의 원격 재생 버튼을 유지한다.
    try { video.disableRemotePlayback = false; } catch (e) { /* 무시 */ }
    var opts = {
      loader: makeLoader(HlsLib),
      enableWorker: true,
      startPosition: typeof startPos === 'number' ? startPos : -1,
      maxBufferLength: 30,
      maxMaxBufferLength: 90,
      backBufferLength: 60,
      // 매니페스트·레벨·키·HTTP 세그먼트는 206 포함 브라우저 캐시를 사용하지 않는다.
      xhrSetup: function (xhr) {
        try {
          xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, max-age=0');
        } catch (e) { /* 무시 */ }
      }
    };
    var Ctor = HlsLib;
    var useP2P = p2pOk;
    if (useP2P) {
      try {
        if (!HlsWithP2P) HlsWithP2P = P2PEngine.injectMixin(HlsLib);
        opts.p2p = p2pOptions();
        Ctor = HlsWithP2P;
      } catch (e) {
        Ctor = HlsLib;
        delete opts.p2p;
        useP2P = false;
      }
    }
    try {
      hls = new Ctor(opts);
    } catch (e) {
      // P2P 믹스인에 문제가 있어도 일반 HLS 재생은 유지
      useP2P = false;
      delete opts.p2p;
      hls = new HlsLib(opts);
    }
    p2pSessionActive = useP2P;
    var instance = hls;
    hls.on(HlsLib.Events.MANIFEST_PARSED, function () {
      if (hls !== instance) return;
      //playSafe();
    });
    hls.on(HlsLib.Events.FRAG_LOADED, function () { if (hls === instance) netRetry = 0; });
    hls.on(HlsLib.Events.ERROR, function (ev, data) {
      if (hls !== instance) return;
      if (!data || !data.fatal) return;
      var det = data.details || data.type;
      var code = data.response && data.response.code;
      var url = data.url || (data.frag && data.frag.url) || (data.context && data.context.url) || '';
      if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
        if (mediaRecover === 0) { mediaRecover++; hls.recoverMediaError(); return; }
        if (mediaRecover === 1) { mediaRecover++; hls.swapAudioCodec(); hls.recoverMediaError(); return; }
        fail(det, code, url);
        return;
      }
      if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) {
        // 매니페스트/키는 토큰이 1회성이라 새 토큰으로 다시 받는다
        if (/^(manifest|level|key)/i.test(det)) { reloadFromFreshSource(det, code, url); return; }
        if (netRetry < 3) {
          netRetry++;
          setTimeout(function () { if (hls === instance) instance.startLoad(video.currentTime > 0 ? video.currentTime : -1); }, 1000 * netRetry);
          return;
        }
      }
      if (isIOS && cfg.mode === 'direct' && video.canPlayType('application/vnd.apple.mpegurl') && !triedNativeFallback) {
        triedNativeFallback = true;
        beacon('fallback', det, code, url);
        destroyHls();
        refreshSource().then(function (s) { startNative(s, video.currentTime || 0); }).catch(function () { fail(det, code, url); });
        return;
      }
      fail(det, code, url);
    });
    instance.loadSource(src);
    instance.attachMedia(video);
  }
  var triedNativeFallback = false;

  function registerIosOld() {
    var r = cfg.iosOld;
    if (!r || !window.fetch) return Promise.resolve();
    return fetch(r.url, {
      method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ c: r.c, auth: r.auth, t: r.t })
    }).then(function () {}, function () {});
  }

  var nativeErrorBound = false;
  function startNative(src, startPos) {
    engine = 'native';
    var go = function () {
      video.src = src;
      if (startPos > 1) {
        video.addEventListener('loadedmetadata', function once() {
          video.removeEventListener('loadedmetadata', once);
          try { video.currentTime = startPos; } catch (e) { /* 무시 */ }
        });
      }
      video.load();
      //playSafe();
    };
    if (!nativeErrorBound) {
      nativeErrorBound = true;
      video.addEventListener('error', function () {
        if (engine !== 'native') return;
        var err = video.error;
        reloadFromFreshSource('native_' + (err ? err.code : 0), 0, cfg.src);
      });
    }
    if (cfg.mode === 'direct') registerIosOld().then(go); else go();
  }

  function boot() {
    HlsLib = window.Hls || null;
    var nativeOk = !!video.canPlayType('application/vnd.apple.mpegurl');
    var hlsOk = !!(HlsLib && HlsLib.isSupported());
    var startPos = resumeAt > 30 ? resumeAt : -1;
    if (cfg.mode === 'relay' && isIOS && nativeOk) startNative(cfg.src, startPos);
    else if (hlsOk) startHls(cfg.src, startPos);
    else if (nativeOk) startNative(cfg.src, startPos);
    else fail('unsupported');
  }

  if (window.Hls) {
    boot();
  } else {
    var s = document.createElement('script');
    s.src = HLS_CDN;
    s.onload = boot;
    s.onerror = boot;
    document.head.appendChild(s);
  }
})();

/* ============================================================
 * TVWiki Player 추가 기능
 *
 * 기존 ArtPlayer용 추가 코드를
 * 현재 TVWiki HLS Player 구조에 맞게 변환한 버전
 *
 * 기능
 * 1. 확인/재생키 → 재생/일시정지
 * 2. NativeApp WatchList 신호
 * 3. 비전체화면 ↑↓ → 부모 iframe 포커스 이동
 * 4. 전체화면 ←→ → Virtual Seek
 * 5. Virtual Seek UI
 * 6. 전체화면 종료 시 자동 일시정지
 * 7. tvwiki Skip Intro 제거
 *
 * ============================================================ */

(function () {

    'use strict';

    /* ------------------------------------------------------------
     * 중복 실행 방지
     * ------------------------------------------------------------ */

    if (window.__TVWIKI_EXTRA_FEATURES__) {
        return;
    }

    window.__TVWIKI_EXTRA_FEATURES__ = true;


    /* ------------------------------------------------------------
     * 기본 객체
     * ------------------------------------------------------------ */

    var root = document.getElementById('tvp');
    var video = document.getElementById('tvp-video');

    if (!root || !video) {
        return;
    }


    /* ------------------------------------------------------------
     * NativeApp 안전 호출
     * ------------------------------------------------------------ */

    function nativeLog(message) {

        try {

            if (
                window.NativeApp &&
                typeof window.NativeApp.jsLog === 'function'
            ) {
                window.NativeApp.jsLog(message);
            }

        } catch (e) {
            /* 무시 */
        }

    }


    /* ------------------------------------------------------------
     * 부모에게 메시지
     * ------------------------------------------------------------ */

    function postTop(message) {

        try {

            window.top.postMessage(message, '*');

        } catch (e) {
            /* 무시 */
        }

    }


    /* ============================================================
     * 1. 재생 / 일시정지
     * ============================================================ */

    function playPause() {

        if (video.paused || video.ended) {

            var p = video.play();

            if (p && p.catch) {

                p.catch(function () {});

            }

        } else {

            video.pause();

        }

    }

    /* ============================================================
     * 전체화면 확인
     * ============================================================ */

    function isFullscreen() {

        return !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement
        );

    }


    /* ============================================================
     * 2. 확인키 / 재생키
     *
     * 기존:
     * _art.playing
     * _art.play()
     * _art.pause()
     *
     * 를 video API로 변경
     * ============================================================ */

    function isPlayKey(event) {

        return (
            event.code === 'KeyF' ||
            event.code === 'Enter' ||
            event.code === 'NumpadEnter' ||
            event.code === 'Space' ||
            event.key === 'Enter' ||
            event.key === 'Select' ||
            event.keyCode === 23 ||      // DPAD_CENTER
            event.keyCode === 66 ||      // ENTER
            event.key === 'MediaPlayPause'
        );

    }


    /* ============================================================
     * 키보드 처리
     *
     * capture 단계에서 현재 player.js의 기존 keydown보다 먼저 처리
     * ============================================================ */

    document.addEventListener(
        'keydown',
        function (event) {

            /* Ctrl / Alt / Meta 조합은 건드리지 않는다. */
            if (
                event.ctrlKey ||
                event.altKey ||
                event.metaKey
            ) {
                return;
            }


            /* ----------------------------------------------------
             * 전체화면
             *
             * 좌우 방향키는 Virtual Seek에서 처리
             * ---------------------------------------------------- */

            if (isFullscreen()) {

				nativeLog('TVWiki Player: 키 수신');

				if (isPlayKey(event)) {
					event.preventDefault();
					event.stopPropagation();
					event.stopImmediatePropagation();

					nativeLog('TVWiki Player: 확인/재생 키 수신');

					// 전체화면 여부와 관계없이 재생/일시정지
					playPause();
					return;
				}


                if (
                    event.code === 'ArrowLeft' ||
                    event.key === 'ArrowLeft' ||
                    event.keyCode === 21 ||
                    event.code === 'ArrowRight' ||
                    event.key === 'ArrowRight' ||
                    event.keyCode === 22
                ) {

                    return;
                }
				
				

				

            }


            /* ----------------------------------------------------
             * 비전체화면
             *
             * 확인키 → 재생/일시정지
             * ---------------------------------------------------- */

            if (!isFullscreen() && isPlayKey(event)) {

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();


                nativeLog(
                    'TVWiki Player: 풀스크린 아닌 상태, 확인키 수신'
                );


                postTop({
                    action: 'sendWatchListAddSignToNative'
                });


                playPause();

                return;

            }
			

            /* ----------------------------------------------------
             * 비전체화면 ↑↓
             *
             * 부모 iframe에 포커스 이동
             * ---------------------------------------------------- */

            if (!isFullscreen()) {

                if (
                    event.code === 'ArrowUp' ||
                    event.code === 'ArrowDown'
                ) {

                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();


                    nativeLog(
                        'TVWiki Player: 풀스크린 아닌 상태, 방향키 수신'
                    );


                    postTop({
                        action: 'IFRAME_MOVE_FOCUS',
                        direction: event.code
                    });


                    return;

                }

            }

        },
        true
    );


    /* ============================================================
     * 3. 전체화면 종료 시 자동 일시정지
     * ============================================================ */

    function handleFullscreenChange() {

        if (
            !isFullscreen() &&
            !video.paused
        ) {

            video.pause();

        }

    }


    document.addEventListener(
        'fullscreenchange',
        handleFullscreenChange
    );

    document.addEventListener(
        'webkitfullscreenchange',
        handleFullscreenChange
    );


    /* ============================================================
     * 4. Virtual Seek
     *
     * ← 10초
     * → 10초
     *
     * 키를 누르는 동안:
     * 실제 currentTime은 변경하지 않는다.
     *
     * 키를 놓으면:
     * 실제 currentTime에 적용한다.
     * ============================================================ */

    var STEP = 10;

    var REPEAT_INTERVAL = 100;

    var HIDE_DELAY = 1000;


    var seeking = false;

    var virtualTime = 0;

    var wasPlaying = false;

    var repeatTimer = null;

    var hideTimer = null;


    /* ------------------------------------------------------------
     * Virtual Seek UI
     * ------------------------------------------------------------ */

    var seekUI = null;

    var seekTime = null;

    var seekProgress = null;

    var seekHandle = null;


    /* ------------------------------------------------------------
     * 시간 포맷
     * ------------------------------------------------------------ */

    function formatTime(seconds) {

        if (!isFinite(seconds) || seconds < 0) {
            seconds = 0;
        }

        seconds = Math.floor(seconds);


        var hours =
            Math.floor(seconds / 3600);


        var minutes =
            Math.floor((seconds % 3600) / 60);


        var secs =
            seconds % 60;


        if (hours > 0) {

            return (
                String(hours).padStart(2, '0') +
                ':' +
                String(minutes).padStart(2, '0') +
                ':' +
                String(secs).padStart(2, '0')
            );

        }


        return (
            String(minutes).padStart(2, '0') +
            ':' +
            String(secs).padStart(2, '0')
        );

    }


    /* ============================================================
     * UI 부모
     *
     * 현재 player의 #tvp를 사용
     * ============================================================ */

    function getUIParent() {

        if (document.fullscreenElement) {

            return document.fullscreenElement;

        }

        return root;

    }


    /* ============================================================
     * Virtual Seek UI 생성
     * ============================================================ */

    function createSeekUI() {

        if (seekUI) {
            return;
        }


        seekUI = document.createElement('div');

        seekUI.id = 'tv-virtual-seek';


        seekUI.innerHTML =
            '<div id="tv-virtual-seek-time">' +
                '00:00 / 00:00' +
            '</div>' +

            '<div id="tv-virtual-seek-bar">' +

                '<div id="tv-virtual-seek-progress">' +
                '</div>' +

                '<div id="tv-virtual-seek-handle">' +
                '</div>' +

            '</div>';


        Object.assign(
            seekUI.style,
            {
                position: 'absolute',

                left: '5%',

                width: '90%',

                bottom: '60px',

                height: '65px',

                zIndex: '2147483647',

                pointerEvents: 'none',

                display: 'none',

                boxSizing: 'border-box'
            }
        );


        /* 시간 */

        seekTime =
            seekUI.querySelector(
                '#tv-virtual-seek-time'
            );


        Object.assign(
            seekTime.style,
            {
                color: '#ffffff',

                fontSize: '22px',

                fontWeight: 'bold',

                textAlign: 'center',

                marginBottom: '12px',

                lineHeight: '28px',

                textShadow:
                    '0 2px 5px rgba(0,0,0,0.9)'
            }
        );


        /* Bar */

        var seekBar =
            seekUI.querySelector(
                '#tv-virtual-seek-bar'
            );


        Object.assign(
            seekBar.style,
            {
                position: 'relative',

                width: '100%',

                height: '8px',

                background:
                    'rgba(255,255,255,0.35)',

                borderRadius: '4px',

                overflow: 'visible'
            }
        );


        /* Progress */

        seekProgress =
            seekUI.querySelector(
                '#tv-virtual-seek-progress'
            );


        Object.assign(
            seekProgress.style,
            {
                position: 'absolute',

                left: '0',

                top: '0',

                width: '0%',

                height: '100%',

                background: '#ff0000',

                borderRadius: '4px'
            }
        );


        /* Handle */

        seekHandle =
            seekUI.querySelector(
                '#tv-virtual-seek-handle'
            );


        Object.assign(
            seekHandle.style,
            {
                position: 'absolute',

                left: '0%',

                top: '50%',

                width: '22px',

                height: '22px',

                transform:
                    'translate(-50%, -50%)',

                background: '#ffffff',

                border: '3px solid #ff0000',

                borderRadius: '50%',

                boxSizing: 'border-box'
            }
        );


        getUIParent().appendChild(seekUI);

    }


    /* ============================================================
     * Fullscreen 진입/종료 시 UI 이동
     * ============================================================ */

    function moveSeekUI() {

        if (!seekUI) {
            return;
        }


        var parent = getUIParent();


        if (
            parent &&
            seekUI.parentElement !== parent
        ) {

            parent.appendChild(seekUI);

        }

    }


    /* ============================================================
     * UI 표시
     * ============================================================ */

    function showSeekUI() {

        createSeekUI();

        moveSeekUI();


        clearTimeout(hideTimer);


        seekUI.style.display = 'block';


        updateSeekUI();

    }


    /* ============================================================
     * UI 숨김
     * ============================================================ */

    function hideSeekUI() {

        if (!seekUI) {
            return;
        }

        seekUI.style.display = 'none';

    }


    /* ============================================================
     * UI 업데이트
     * ============================================================ */

    function updateSeekUI() {

        if (!seekUI) {
            return;
        }


        var duration = video.duration;


        if (
            !isFinite(duration) ||
            duration <= 0
        ) {
            return;
        }


        var percent =
            Math.max(
                0,
                Math.min(
                    100,
                    virtualTime / duration * 100
                )
            );


        seekProgress.style.width =
            percent + '%';


        seekHandle.style.left =
            percent + '%';


        seekTime.textContent =
            formatTime(virtualTime) +
            ' / ' +
            formatTime(duration);

    }


    /* ============================================================
     * Virtual Time 이동
     * ============================================================ */

    function moveVirtualTime(direction) {

        var duration = video.duration;


        if (
            !isFinite(duration) ||
            duration <= 0
        ) {
            return;
        }


        virtualTime +=
            direction * STEP;


        virtualTime =
            Math.max(
                0,
                Math.min(
                    duration,
                    virtualTime
                )
            );


        updateSeekUI();

    }


    /* ============================================================
     * Seek 시작
     * ============================================================ */

    function startVirtualSeek(direction) {

        if (!isFullscreen()) {
            return;
        }


        if (
            !isFinite(video.duration) ||
            video.duration <= 0
        ) {
            return;
        }


        if (!seeking) {

            seeking = true;


            virtualTime =
                video.currentTime;


            wasPlaying =
                !video.paused;


            /*
             * 이동 중에는 영상 일시정지
             *
             * 기존 코드처럼 실제 currentTime은
             * 키를 놓을 때까지 변경하지 않는다.
             */

            if (wasPlaying) {
                video.pause();
            }


            showSeekUI();

        }


        moveVirtualTime(direction);


        if (repeatTimer !== null) {

            clearInterval(repeatTimer);

        }


        repeatTimer =
            setInterval(
                function () {

                    if (!seeking) {
                        return;
                    }


                    moveVirtualTime(direction);

                },
                REPEAT_INTERVAL
            );

    }


    /* ============================================================
     * Seek 종료
     * ============================================================ */

    function finishVirtualSeek() {

        if (!seeking) {
            return;
        }


        if (repeatTimer !== null) {

            clearInterval(repeatTimer);

            repeatTimer = null;

        }


        /*
         * 실제 위치 적용
         */

        video.currentTime =
            virtualTime;


        /*
         * 원래 재생 중이었다면 다시 재생
         */

        if (wasPlaying) {

            var p = video.play();

            if (p && p.catch) {

                p.catch(function () {});

            }

        }


        seeking = false;


        clearTimeout(hideTimer);


        hideTimer =
            setTimeout(
                function () {

                    hideSeekUI();

                },
                HIDE_DELAY
            );

    }


    /* ============================================================
     * 좌우 키 판별
     * ============================================================ */

    function isLeft(event) {

        return (
            event.code === 'ArrowLeft' ||
            event.key === 'ArrowLeft' ||
            event.keyCode === 21
        );

    }


    function isRight(event) {

        return (
            event.code === 'ArrowRight' ||
            event.key === 'ArrowRight' ||
            event.keyCode === 22
        );

    }


    /* ============================================================
     * KEY DOWN
     *
     * capture 단계
     *
     * 현재 player.js의 기본 seekBy()보다 먼저 가로챈다.
     * ============================================================ */

    document.addEventListener(
        'keydown',
        function (event) {

            if (!isFullscreen()) {
                return;
            }


            var left =
                isLeft(event);


            var right =
                isRight(event);


            if (!left && !right) {
                return;
            }


            event.preventDefault();

            event.stopPropagation();

            event.stopImmediatePropagation();


            var direction =
                left ? -1 : 1;


            nativeLog(
                left
                    ? 'Virtual Seek LEFT'
                    : 'Virtual Seek RIGHT'
            );


            startVirtualSeek(direction);

        },
        true
    );


    /* ============================================================
     * KEY UP
     * ============================================================ */

    document.addEventListener(
        'keyup',
        function (event) {

            if (!isFullscreen()) {
                return;
            }


            var left =
                isLeft(event);


            var right =
                isRight(event);


            if (!left && !right) {
                return;
            }


            event.preventDefault();

            event.stopPropagation();

            event.stopImmediatePropagation();


            if (seeking) {

                nativeLog(
                    'Virtual Seek 적용'
                );


                finishVirtualSeek();

            }

        },
        true
    );


    /* ============================================================
     * Fullscreen 변경
     * ============================================================ */

    document.addEventListener(
        'fullscreenchange',
        function () {

            moveSeekUI();


            /*
             * Fullscreen 종료 중 Virtual Seek 상태가 남아 있으면
             * 정리
             */

            if (!isFullscreen() && seeking) {

                if (repeatTimer !== null) {

                    clearInterval(repeatTimer);

                    repeatTimer = null;

                }


                seeking = false;

                hideSeekUI();

            }

        }
    );


    document.addEventListener(
        'webkitfullscreenchange',
        function () {

            moveSeekUI();


            if (!isFullscreen() && seeking) {

                if (repeatTimer !== null) {

                    clearInterval(repeatTimer);

                    repeatTimer = null;

                }


                seeking = false;

                hideSeekUI();

            }

        }
    );


    /* ============================================================
     * 5. tvwiki Skip Intro 제거
     *
     * 기존 코드 그대로 유지
     * ============================================================ */

    function removeSkipIntroButton() {

        document
            .querySelectorAll(
                '.tvwiki-skip-intro-btn'
            )
            .forEach(
                function (element) {

                    element.remove();

                }
            );

    }


    removeSkipIntroButton();


    setTimeout(
        removeSkipIntroButton,
        100
    );


    setTimeout(
        removeSkipIntroButton,
        500
    );


    setTimeout(
        removeSkipIntroButton,
        1000
    );


    var skipObserver =
        new MutationObserver(
            function () {

                removeSkipIntroButton();

            }
        );


    if (document.documentElement) {

        skipObserver.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );

    }


    var skipStyle =
        document.createElement('style');


    skipStyle.textContent =

        '.tvwiki-skip-intro-btn,' +
        '[class*="tvwiki-skip-intro-btn"] {' +
            'display:none !important;' +
            'visibility:hidden !important;' +
            'opacity:0 !important;' +
            'pointer-events:none !important;' +
        '}';


    document.head.appendChild(
        skipStyle
    );


})();
