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
        // 1. 전체화면 진입 / 탈출
        // ===================================================
        mediaPlayer.addEventListener('fullscreen-change', (e) => {
            const isFullscreen = e.detail === true;

            if (isFullscreen) {
                video.play();
                video.volume = 1.0;
                video.muted = false;
            } else {
                video.pause();
                try {
                    NativeApp.removeFocusAfterFullScreenOut();
                } catch (e) {}
            }
        });

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
                NativeApp.requestPlayButton();
            } catch (e) {}
        });

        mediaPlayer.addEventListener('fullscreen-change', () => {
            setTimeout(resizeOverlay, 50);
        });

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
        window.addEventListener('message', (event) => {
            if (!event.data || event.data.type !== 'REMOTE_CONTROL') return;

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
    });

})();
