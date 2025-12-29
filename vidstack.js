import"./chunks/vidstack-duezrkCY.js";import"https://cdn.vidstack.io/icons";import"./chunks/vidstack-CYF5HBsg.js";import"./chunks/vidstack-0lhgLM-q.js";import"./chunks/vidstack-BgkHvjzX.js";import"./chunks/vidstack-DI6EtP9D.js";import"./chunks/vidstack-BH4h6ty-.js";import"./chunks/vidstack-C_AxqLKV.js";import"./chunks/vidstack-DRH_1tFW.js";import"./chunks/vidstack-BfBBPhXV.js";import"./chunks/vidstack-D3XUwguk.js";


// =======================================================
// Vidstack 대응 공통 패치 (vidstack.js 이후 로드)
// =======================================================

(function () {
    'use strict';
    function waitForPlayer(callback) {
        let tries = 0;
        const maxTries = 300;

        const timer = setInterval(() => {
            const mediaPlayer = document.querySelector('media-player');
            const video = mediaPlayer?.querySelector('video');

            if (mediaPlayer && video) {
                clearInterval(timer);
                callback(mediaPlayer, video);
            } else if (++tries > maxTries) {
                clearInterval(timer);
            }
        }, 200);
    }

    waitForPlayer((mediaPlayer, video) => {
        // ===================================================
        // 1. 전체화면 진입/탈출시 비디오 일시정지, 재생하는 함수
        // ===================================================
        document.addEventListener('fullscreenchange', () => {
            const fsEl = document.fullscreenElement;

            // fullscreen 진입
            if (fsEl) {
                const video = fsEl.querySelector?.('video')
                           || document.querySelector('video');

                if (!video) return;

                NativeApp.jsLog("전체화면 켜기: 비디오 재생");
                video.play().catch(()=>{});
                video.volume = 1.0;
                video.muted = false;
            }
            // fullscreen 해제
            else {
                const video = document.querySelector('video');
                if (!video) return;

                NativeApp.jsLog("전체화면 해제: 비디오 일시중지");
                video.pause();

                try {
                    NativeApp.removeFocusAfterFullScreenOut();
                } catch (e) {}
            }
        }, true); // ★ capture 단계 중요



        // ===================================================
        // 2. 재생 / 일시정지 상태 Native 전달
        // ===================================================
        video.addEventListener('play', () => {
            try {
                NativeApp.togglePlayerState(true);
            } catch (e) {}
        });

        video.addEventListener('pause', () => {
            try {
                NativeApp.togglePlayerState(false);
            } catch (e) {}
        });



        // ===================================================
        // 3. 영상 종료 (다음화 자동재생)
        // ===================================================
        video.addEventListener('ended', () => {
            try {
                NativeApp.onVideoFinishedFromVideoJs();
            } catch (e) {}
        });



        // ===================================================
        // 4. 워터마크 블러 오버레이
        // ===================================================
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.background = 'rgba(96,96,96,0.25)';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = 9999;
        overlay.style.backdropFilter = 'blur(8px)';
        overlay.style.display = 'none';
        mediaPlayer.style.position = 'relative';
        mediaPlayer.appendChild(overlay);

        function resizeOverlay() {
            if (!video.videoWidth || !video.videoHeight) return;

            const pw = mediaPlayer.offsetWidth;
            const ph = mediaPlayer.offsetHeight;

            overlay.style.width  = (pw * 0.057) + 'px';
            overlay.style.height = (ph * 0.09)  + 'px';
            overlay.style.top    = (ph * 0.015) + 'px';
            overlay.style.right  = (pw * 0.015) + 'px';
        }

        video.addEventListener('loadedmetadata', () => {
            resizeOverlay();
            try {
                NativeApp.jsLog("메타데이터 로드 완료");
                NativeApp.requestPlayButton();
            } catch (e) {}
        });

        document.addEventListener('fullscreenchange', () => { setTimeout(resizeOverlay, 50); });

        video.addEventListener('timeupdate', () => {
            if (video.currentTime >= 0 && video.currentTime <= 181) {
                overlay.style.display = 'block';
                resizeOverlay();
            } else {
                overlay.style.display = 'none';
            }
        });



        // ===================================================
        // 5. 외부(Remote) 컨트롤
        // ===================================================
        let fakeTimeOverlay;

        function showFakeTime(playerEl, seconds) {
            if (!fakeTimeOverlay) {
                fakeTimeOverlay = document.createElement('div');
                fakeTimeOverlay.style.cssText = `
                    position:absolute;
                    bottom:60px;
                    right:40px;
                    padding:6px 10px;
                    background:rgba(0,0,0,0.7);
                    color:#fff;
                    font-size:14px;
                    z-index:10000;
                    border-radius:4px;
                `;
                playerEl.appendChild(fakeTimeOverlay);
            }
            fakeTimeOverlay.textContent = formatTime(seconds);
            fakeTimeOverlay.style.display = 'block';
        }

        function hideFakeTime() {
            if (fakeTimeOverlay) {
                fakeTimeOverlay.style.display = 'none';
            }
        }

        function formatTime(t) {
            const m = Math.floor(t / 60);
            const s = Math.floor(t % 60);
            return `${m}:${String(s).padStart(2, '0')}`;
        }

        function wakeControls(target) {
            ['mousemove', 'pointermove', 'keydown'].forEach(type => {
                target.dispatchEvent(new Event(type, { bubbles: true }));
            });
        }

        window.addEventListener('message', (event) => {
            if (!event.data || event.data.type !== 'REMOTE_CONTROL') return;

            const action = event.data.action;

            if (action === 'ARROW_LEFT' || action === 'ARROW_RIGHT') {
                const step = action === 'ARROW_LEFT' ? -10 : 10;
                const newTime = Math.max(0, Math.min(video.duration, video.currentTime + step));

                // 1. 가짜 UI 즉시 표시
                showFakeTime(mediaPlayer, newTime);

                // 2. 실제 seek
                video.currentTime = newTime;

                // 3. 진짜 timeupdate가 오면 제거
                const onTimeUpdate = () => {
                    hideFakeTime();
                    video.removeEventListener('timeupdate', onTimeUpdate);
                };
                video.addEventListener('timeupdate', onTimeUpdate);

                wakeControls(video);
                //NativeApp.jsLog("시간 조정");
            }

            if (action === 'TOGGLE_PLAY') {
                video.paused ? video.play() : video.pause();
            }
        });
    });

})();

// =======================================================
// Vidstack / Custom UI 버튼 제거 (최종)
// vidstack.js 맨 아래에 그대로 추가
// =======================================================
(function () {
  'use strict';

  function removeButtons() {
    /* ---------------------------------------------------
     * 1. Vidstack media-controller 속성으로 제거
     * --------------------------------------------------- */
    const controller = document.querySelector('media-controller');
    if (controller) {
      [
        'no-pip',
        'no-settings',
        'no-captions',
        'no-airplay',
        'no-google-cast'
      ].forEach(attr => controller.setAttribute(attr, ''));
    }

    /* ---------------------------------------------------
     * 2. Vidstack WebComponent 버튼 직접 제거 (안전망)
     * --------------------------------------------------- */
    document.querySelectorAll(
      'media-airplay-button, media-google-cast-button'
    ).forEach(el => el.remove());

    /* ---------------------------------------------------
     * 3. 커스텀 HTML 버튼 제거
     * --------------------------------------------------- */
    [
      'pipBtn',
      'settingsBtn',
      'settingsPanel',
      'ccBtn'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  /* ---------------------------------------------------
   * 4. Vidstack는 lazy-render 이므로 반복 시도
   * --------------------------------------------------- */
  let tries = 0;
  const maxTries = 50; // 약 5초

  const interval = setInterval(() => {
    removeButtons();
    tries++;

    // media-controller가 잡히면 종료
    if (document.querySelector('media-controller') || tries >= maxTries) {
      clearInterval(interval);
    }
  }, 100);

})();
