import"./chunks/vidstack-duezrkCY.js";import"https://cdn.vidstack.io/icons";import"./chunks/vidstack-CYF5HBsg.js";import"./chunks/vidstack-0lhgLM-q.js";import"./chunks/vidstack-BgkHvjzX.js";import"./chunks/vidstack-DI6EtP9D.js";import"./chunks/vidstack-BH4h6ty-.js";import"./chunks/vidstack-C_AxqLKV.js";import"./chunks/vidstack-DRH_1tFW.js";import"./chunks/vidstack-BfBBPhXV.js";import"./chunks/vidstack-D3XUwguk.js";


// =======================================================
// Vidstack 실전 대응 패치 (ESM / SPA 안전)
// =======================================================
(function () {
    'use strict';

    function attach(mediaPlayer) {
        if (mediaPlayer.__patched) return;
        mediaPlayer.__patched = true;

        function getVideo() {
            return mediaPlayer.querySelector('video');
        }

        // ---------------------------------------------------
        // 1. 전체화면 진입 / 탈출
        // ---------------------------------------------------
        mediaPlayer.addEventListener('media-fullscreen-change', (e) => {
            const isFullscreen = e.detail?.fullscreen === true;
            const video = getVideo();
            if (!video) return;

            if (isFullscreen) {
                video.play().catch(()=>{});
                video.muted = false;
                video.volume = 1.0;
            } else {
                video.pause();
                try {
                    NativeApp.removeFocusAfterFullScreenOut();
                } catch {}
            }
        });

        // ---------------------------------------------------
        // 2. 재생 / 일시정지 상태 전달
        // ---------------------------------------------------
        mediaPlayer.addEventListener('media-play', () => {
            try { NativeApp.togglePlayerState(true); } catch {}
        });

        mediaPlayer.addEventListener('media-pause', () => {
            try { NativeApp.togglePlayerState(false); } catch {}
        });

        // ---------------------------------------------------
        // 3. 영상 종료
        // ---------------------------------------------------
        mediaPlayer.addEventListener('media-ended', () => {
            try { NativeApp.onVideoFinishedFromVideoJs(); } catch {}
        });

        // ---------------------------------------------------
        // 4. 워터마크 블러 오버레이
        // ---------------------------------------------------
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:absolute;
            background:rgba(96,96,96,0.25);
            backdrop-filter:blur(8px);
            pointer-events:none;
            z-index:9999;
            display:none;
        `;

        mediaPlayer.style.position = 'relative';
        mediaPlayer.appendChild(overlay);

        function resizeOverlay() {
            const video = getVideo();
            if (!video || !video.videoWidth) return;

            const pw = mediaPlayer.offsetWidth;
            const ph = mediaPlayer.offsetHeight;

            overlay.style.width  = (pw * 0.057) + 'px';
            overlay.style.height = (ph * 0.09)  + 'px';
            overlay.style.top    = (ph * 0.015) + 'px';
            overlay.style.right = (pw * 0.015) + 'px';
        }

        mediaPlayer.addEventListener('media-loaded-metadata', () => {
            resizeOverlay();
            try { NativeApp.requestPlayButton(); } catch {}
        });

        mediaPlayer.addEventListener('media-fullscreen-change', () => {
            setTimeout(resizeOverlay, 50);
        });

        // 시간 조건
        setInterval(() => {
            const video = getVideo();
            if (!video) return;

            if (video.currentTime <= 181) {
                overlay.style.display = 'block';
                resizeOverlay();
            } else {
                overlay.style.display = 'none';
            }
        }, 300);

        // ---------------------------------------------------
        // 5. 외부(Remote) 제어
        // ---------------------------------------------------
        window.addEventListener('message', (event) => {
            if (event.data?.type !== 'REMOTE_CONTROL') return;

            const video = getVideo();
            if (!video) return;

            const action = event.data.action;

            if (action === 'ARROW_LEFT' || action === 'ARROW_RIGHT') {
                const step = action === 'ARROW_LEFT' ? -10 : 10;
                video.currentTime = Math.max(
                    0,
                    Math.min(video.duration || 0, video.currentTime + step)
                );
            }

            if (action === 'TOGGLE_PLAY') {
                video.paused ? video.play() : video.pause();
            }
        });
    }

    // ---------------------------------------------------
    // media-player 생성 감시 (ESM / SPA 대응)
    // ---------------------------------------------------
    const observer = new MutationObserver(() => {
        document.querySelectorAll('media-player').forEach(attach);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

})();


