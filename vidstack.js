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
    var playerWidth = mediaPlayer.offsetWidth;
    var playerHeight = mediaPlayer.offsetHeight;
    var sourceWidth = video.videoWidth;
    var sourceHeight = video.videoHeight;
    var sourceRatio = sourceWidth / sourceHeight;
    var deviceWidth = window.screen.width;
    var deviceHeight = window.screen.height;
    var deviceRatio = deviceWidth / deviceHeight;

    var blurWidth = (playerWidth * 0.057);
    var blurHeight = (playerHeight * 0.09);
    var blurTop = (playerHeight * 0.015);
    var blurRight = (playerWidth * 0.015);
    var zoomRate = 1;
    var isZoom = false;

    if (sourceHeight < 1080 && sourceWidth < 1920) isZoom = true;

    if (deviceWidth > deviceHeight) {
        if (sourceRatio === deviceRatio) {
            if (isZoom) zoomRate = 1920 / sourceWidth;
            blurTop *= zoomRate;
            blurRight *= zoomRate;
            blurWidth *= zoomRate;
            blurHeight *= zoomRate;
        } else if (sourceRatio > deviceRatio) {
            var actualHeight = sourceHeight / (sourceWidth / playerWidth);
            blurTop = 17 / (sourceWidth / deviceWidth) + ((playerHeight - actualHeight) / 2);
        } else {
            zoomRate = playerHeight / sourceHeight;
            var actualWidth = sourceWidth / (sourceHeight / deviceHeight);
            blurTop = 17 * zoomRate;
            blurRight = (31 * zoomRate)
                + (deviceWidth - actualWidth) / 2
                - (deviceWidth - playerWidth) / 2;
            blurWidth = 109 * zoomRate;
            blurHeight = 87 * zoomRate;
        }
    } else {
        var playerRatio = playerWidth / playerHeight;
        if (sourceRatio > playerRatio) {
            blurTop += (playerHeight - (sourceHeight / (sourceWidth / playerWidth))) / 2;
        } else if (sourceRatio < playerRatio) {
            var value = (playerWidth - (sourceWidth / (sourceHeight / playerHeight))) / 2;
            zoomRate = playerHeight / sourceHeight;
            blurWidth = 109 * zoomRate;
            blurHeight = 87 * zoomRate;
            blurTop = 17 * zoomRate;
            blurRight = (31 * zoomRate) + value;
        }
    }

    overlay.style.width = blurWidth + 'px';
    overlay.style.height = blurHeight + 'px';
    overlay.style.top = blurTop + 'px';
    overlay.style.right = blurRight + 'px';
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
     * 3. 커스텀 HTML 버튼 제거 (중앙 컨트롤 포함)
     * --------------------------------------------------- */
    [
      'pipBtn',
      'settingsBtn',
      'settingsPanel',
      'ccBtn',
      'centerControls' // ★ 추가
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

    if (document.getElementById('centerControls') === null || tries >= maxTries) {
      clearInterval(interval);
    }
  }, 100);

})();



// ===================================================
// Vidstack 컨트롤 표시 시 프레임 드랍 완화 패치
// (원본 코드 수정 없음 / 하단 추가 전용)
// ===================================================
(function () {
  function applyVidstackPerfPatch() {
    const player = document.querySelector('media-player');
    if (!player) return;

    const controls = player?.querySelector('media-controls');

    player.addEventListener('play', () => {
      controls.style.display = 'none';
    }, { once: true });

    const video = player.querySelector('video');
    const controller = player.querySelector('media-controller');

    if (!video || !controller) return;

    // ---------------------------------------------------
    // 1. video를 GPU 합성 레이어에 강제로 고정
    // ---------------------------------------------------
    video.style.transform = 'translateZ(0)';
    video.style.willChange = 'transform';
    video.style.backfaceVisibility = 'hidden';

    // ---------------------------------------------------
    // 2. 컨트롤 애니메이션 / 트랜지션 제거
    //    (opacity, transform 변화가 레이어 강등 원인)
    // ---------------------------------------------------
    const style = document.createElement('style');
    style.textContent = `
      media-controller,
      media-controller * {
        transition: none !important;
        animation: none !important;
      }

      media-controller {
        will-change: auto !important;
        contain: layout paint style;
      }
    `;
    document.head.appendChild(style);

    // ---------------------------------------------------
    // 3. 컨트롤 표시 중 video hit-test 차단
    //    (포커스/접근성 트리 충돌 방지)
    // ---------------------------------------------------
    const updatePointerState = () => {
      const visible =
        controller.hasAttribute('data-visible') ||
        controller.getAttribute('aria-hidden') === 'false';

      video.style.pointerEvents = visible ? 'none' : 'auto';
    };

    // 초기 상태
    updatePointerState();

    // ---------------------------------------------------
    // 4. 컨트롤 상태 변경 감지 (MutationObserver)
    // ---------------------------------------------------
    const observer = new MutationObserver(updatePointerState);
    observer.observe(controller, {
      attributes: true,
      attributeFilter: ['data-visible', 'aria-hidden', 'class']
    });
  }

  // DOM 준비 후 적용
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyVidstackPerfPatch);
  } else {
    applyVidstackPerfPatch();
  }
})();
