// ==UserScript==
// @name        tvFlixUserScirpt
// @include     /^https?:\/\/[^/]*(tvwiki|tvmon)[^/]*\/.*$/
// @grant        GM_xmlhttpRequest
// ==/UserScript==
//
// ==============================================================================================================
// 본 스크립트의 목적
// ==============================================================================================================
// 1. 웹사이트 내 불필요한 요소 포커스 비활성화
// 2. 웹사이트 요소 제거
// 3. 웹사이트 요소 추가
// 4. 웹사이트 요소 변경
// 5. 네이티브 인터랙션
// 6. 기타
// 7. 스마트폰 PIP 지원
// 8. 검색어 자동완성 기능: TMDB(The Move Database) Api 적용
// 9. 검색창, 카테고리 필터 관련 키 입력 오버라이드
// ==============================================================================================================
const isRunningOnTv = (navigator.userAgent.toLowerCase().includes("tv"));
const isWebBrowser = (typeof NativeApp == 'undefined');
var nextEpisodeLink = "";
var isOnlyVideo = false;
var videoThumbUrl = "";
var isVideoLoaded = false;
const pathname = window.location.pathname;
const pathSegments = pathname.split('/').filter(seg => seg !== '');
const pageNumber = pathSegments.length;
var thisEpisodeTitle = "";

function removeByClassName(className) {
	const el = document.querySelector(className);
	if (el) el.remove();
}
function removeById(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
function disableFocusById(id) {
	const el = document.getElementById(id);
	if (el) el.setAttribute('tabIndex', '-1');
}
function disableFocusByClassName(className) {
	const el = document.querySelector(className);
	if (el) el.setAttribute('tabindex', '-1');
}
function hideByClassName(className) {
	const el = document.querySelector(className);
	if (el) el.style.setProperty('display', 'none', 'important');
}
function hideById(id) {
	const el = document.getElementById(id);
	if (el) el.style.setProperty('display', 'none', 'important');
}

// ==============================================================================================================
// 2. 웹사이트 요소 제거
// ==============================================================================================================
(function() {


	//재생 페이지에서 회차가 하나밖에 없는 경우, 회차 영역 전체를 제거
	//재생 페이지에서 회차가 여러개인 경우, 다음화 자동재생을 위해 에피소드 제목을 목록 배열에 추가  
	if (pageNumber > 1) {  
		const target = document.querySelector('.episode-list');
		if (target) {
		const items = target.querySelectorAll('a');
		if ( items.length <= 1) {			
			target.remove();
			isOnlyVideo = true;
		}	
	}	  
  }

})();
// ==============================================================================================================
// 


console.log("UserSciprt Process : 2");



// ==============================================================================================================
// 3. 웹사이트 요소 추가(검색버튼 텍스트, 동영상 재생버튼, 특수 포커스 효과)
// ==============================================================================================================
//특수 포커스 효과: TV(O)::Phone(X)::Web(X)
(function() {
  if (!isRunningOnTv) return;

  const style = document.createElement('style');
  style.innerHTML = `
      :focus:not(body):not([tabindex="-1"]) {
          z-index: 9999 !important;
          background-color: #552E00 !important;
          outline: 4px solid #FFD700 !important;
          outline-offset: 0px !important;
          box-shadow:
              0 0 0 400px #552E00 inset,
              0 0 400px rgba(255, 215, 0, 1) !important;
          transition: outline-color 0.2s, box-shadow 0.2s;
      }
  `;
  document.head.appendChild(style);

  let focusOverlay = null;

  document.addEventListener('focusin', (e) => {
      const target = e.target.closest &&
        e.target.closest('.title, .title2, .filter_layer a, .filter2_layer a');
      if (!target) return;

      const parentDiv = target.parentElement;
      const isSearchPageItem =
        parentDiv &&
        parentDiv.tagName === 'DIV' &&
        parentDiv.classList.contains('con');

      const isDropDownItem =
        e.target.closest('.filter_layer a, .filter2_layer a');

      const rect = target.getBoundingClientRect();

      // 원본 투명화
      target.style.opacity = '0';

      // 시작 / 최종 크기 분리 ★
      const startWidth  = `${rect.width}px`;
      const startHeight = `${rect.height}px`;

      const finalWidth =
        isSearchPageItem ? '65%' : `${rect.width}px`;

      const finalHeight =
        isDropDownItem ? `${rect.height}px` : `${rect.height + 30}px`;

      // overlay 생성
      focusOverlay = document.createElement('div');
      focusOverlay.textContent = target.textContent;

      Object.assign(focusOverlay.style, {
          position: 'absolute',
          top: isSearchPageItem
              ? `${rect.top + window.scrollY - 30}px`
              : `${rect.top + window.scrollY}px`,
          left: `${rect.left + window.scrollX}px`,

          // ★ 시작 크기 (원본과 동일)
          width: startWidth,
          height: startHeight,

          color: '#FFF',
          fontWeight: 'bold',
          background: '#552E00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: '999999',
          pointerEvents: 'none',
          padding: '4px 10px',

          outline: '4px solid #FFD700',
          outlineOffset: '0',
          boxShadow: `
              0 0 0 400px #552E00 inset,
              0 0 400px rgba(255, 215, 0, 1)
          `,

          // ★ width / height 애니메이션
          transition: `
              width 0.22s cubic-bezier(0.2, 0, 0.38, 0.9),
              height 0.22s cubic-bezier(0.2, 0, 0.38, 0.9),
              box-shadow 0.2s
          `,
      });

      // 글꼴 스타일 복사
      const cs = window.getComputedStyle(target);
      focusOverlay.style.fontSize = cs.fontSize;
      focusOverlay.style.fontFamily = cs.fontFamily;

      document.body.appendChild(focusOverlay);

      // ★ 다음 프레임에서 최종 크기 적용
      requestAnimationFrame(() => {
          if (!focusOverlay) return;
          focusOverlay.style.width  = finalWidth;
          focusOverlay.style.height = finalHeight;
      });
  });

  document.addEventListener('focusout', (e) => {
      const el = e.target;

      // 원본 복원
      el.style.opacity = '';

      // overlay 제거
      if (focusOverlay) {
          focusOverlay.remove();
          focusOverlay = null;
      }
  });
})();




// ==============================================================================================================
// ==============================================================================================================

console.log("UserSciprt Process : 3");

// ==============================================================================================================
// 4. 웹사이트 요소 변경
// ==============================================================================================================

//재생 페이지 이전화, 다음화 버튼 글씨 크기 조정
(function() {

	if (pageNumber < 2) return;

    const css = `
        /* 전체 버튼 글씨 키우기 */
        .bo_v_nb_mobile li a {
            font-size: 1.3rem !important;
            font-weight: 600 !important;
            padding: 12px 18px !important;
        }

        /* circle 크기 */
        .bo_v_nb_mobile li a .circle {
            width: 28px !important;
            height: 28px !important;
            font-size: 1.0rem !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
        }

        /* 아이콘 크기 (font-awesome) */
        .bo_v_nb_mobile li a .circle i {
            font-size: 1.2rem !important;
        }
    `;

    const style = document.createElement('style');
    style.innerHTML = css;
    document.head.appendChild(style);
})();



// ==============================================================================================================
// ==============================================================================================================

console.log("UserSciprt Process : 4");

// ==============================================================================================================
// 5. 네이티브 인터랙션
// ==============================================================================================================
//네이티브 호출 함수
(function() {
  'use strict'
  //네이티브에서 ESC혹은 뒤로가기 실행시 호출할 함수
  window.handleBackButton = function() {
    // 1. 검색창에서 ESC, 뒤로가기 눌렀을 때 동작
const searchLayer = document.getElementById('userscript-search');

if (searchLayer) {

    // 검색창 제거
    searchLayer.remove();

    // 검색창 CSS 제거
    document.getElementById('userscript-search-style')?.remove();

    // 현재 포커스 제거
    if (document.activeElement) {
        document.activeElement.blur();
    }

    return;
}

    // 2. 드롭다운 선택중 ESC, 뒤로가기 눌렀을 때 동작
    const layer2 = document.querySelector('.filter2_layer');
    if (layer2) {
      const computed = window.getComputedStyle(layer2);
      const hasActiveClass = layer2.classList && layer2.classList.contains('active');
      const displayVisible = (layer2.style.display && layer2.style.display !== 'none') || (computed.display && computed.display !== 'none');
      const visibilityVisible = (layer2.style.visibility && layer2.style.visibility !== 'hidden') || (computed.visibility && computed.visibility !== 'hidden');
      const offscreen = layer2.style.left && (layer2.style.left === '-9999px' || layer2.style.left.indexOf('-') === 0);
      const isOpen = hasActiveClass || (displayVisible && visibilityVisible && !offscreen);
      if (isOpen) {
        layer2.classList.remove('active');// 닫기: 사이트가 어떤 방식으로 열어놨든 안전하게 닫도록 여러 속성 설정
        // 원래 버튼으로 포커스 복귀
        var btn = document.querySelector('.filter2 .btn_filter')
        if (!btn) btn = document.querySelector('.filter2 .btn_filter2')
        btn.focus();
        btn.click();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    const layer = document.querySelector('.filter_layer');
    if (layer) {
      const computed = window.getComputedStyle(layer);
      const hasActiveClass = layer.classList && layer.classList.contains('active');
      const displayVisible = (layer.style.display && layer.style.display !== 'none') || (computed.display && computed.display !== 'none');
      const visibilityVisible = (layer.style.visibility && layer.style.visibility !== 'hidden') || (computed.visibility && computed.visibility !== 'hidden');
      const offscreen = layer.style.left && (layer.style.left === '-9999px' || layer.style.left.indexOf('-') === 0);
      const isOpen = hasActiveClass || (displayVisible && visibilityVisible && !offscreen);
      if (isOpen) {
        layer.classList.remove('active');// 닫기: 사이트가 어떤 방식으로 열어놨든 안전하게 닫도록 여러 속성 설정
        // 원래 버튼으로 포커스 복귀
        const btn = document.querySelector('.filter .btn_filter');
        btn.focus();
        btn.click();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    //3. 검색창이나 드롭다운 활성화 상태가 아닌 경우
    const host = location.hostname.replace(/^www\./, "");
    const path = window.location.pathname.replace(/\/$/, ""); // 끝의 / 제거
    NativeApp.showNativeMenu();
  }
})();
//네이티브로 변수 전송:TV(O)::Phone(O)::Web(X)
(function() {
  if (typeof NativeApp !== 'undefined') {
    NativeApp.setWebVar("iframe", "iframe");
  }

})();
//네이티브로 시청목록 정보 보내기: TV(O)::Phone(O)::Web(X)
(function() {
  if (isWebBrowser) return;
  function cleanTitle(str) {
    let s = str;

    // ---------------------------------------------------------
    // 0) "숫자 + 화" 로 끝나는지 검사하고 사전 처리
    // 예: "드라마 12화" → "드라마 12화"
    //     하지만 "드라마 12화 OST" 는 로직 적용 X (마지막이 "화"일 때만)
    // ---------------------------------------------------------
    // 패턴: 마지막 단어가 숫자+화 인지
    const lastWordMatch = s.match(/(\d+)화$/);
    if (lastWordMatch) {
        // 마지막 공백을 찾는다
        const lastSpaceIdx = s.lastIndexOf(" ");
        if (lastSpaceIdx !== -1) {
            s = s.substring(0, lastSpaceIdx);
        }
    }

    // ---------------------------------------------------------
    // 1) " 시즌" 포함 시, 해당 위치부터 뒤 모두 제거
    // ---------------------------------------------------------
    const idx = s.indexOf(" 시즌");
    if (idx !== -1) {
        s = s.substring(0, idx);
    }

    // ---------------------------------------------------------
    // 2) "(무자막)" 제거
    // ---------------------------------------------------------
    s = s.replace(/\(무자막\)/g, "");

    // ---------------------------------------------------------
    // 최종 정리
    // ---------------------------------------------------------
    return s.trim();
}
  window.sendWatchListAddSignToNative = function() {
      //링크 추출
      const videoLink = window.location.href
      if (typeof NativeApp !== 'undefined') NativeApp.receiveVideoTitleLinkImage(thisEpisodeTitle, videoLink, videoThumbUrl);
  }
})();
// ==============================================================================================================
// ==============================================================================================================


// ==============================================================================================================
// 8. 검색어 자동완성 기능: TMDB(The Move Database) Api 적용
// ==============================================================================================================
//네이티브
(function() {

	// 웹뷰 여부에 따라 스킵
	if (isWebBrowser) return;
/*
	//G보드 기본 자동완성 기능 막기
	const input = document.getElementById('sch_stx');
	input.setAttribute('autocomplete', 'off');
	input.setAttribute('autocorrect', 'off');
	input.setAttribute('autocapitalize', 'off');
	input.setAttribute('spellcheck', 'false');
	input.removeAttribute('value');

    const searchWrap = document.querySelector('.search_wrap');

    if (!input || !searchWrap) return;

    // --- container 생성 ---
    const container = document.createElement('div');
    container.id = 'autocomplete_parent';
    container.style.position = 'fixed';
    container.style.background = '#000';
    container.style.border = '1px solid #ccc';
    container.style.maxHeight = '250px';
    container.style.overflowY = 'auto';
    container.style.zIndex = '999999';
    container.style.display = 'block';       // 반드시 block
    container.style.visibility = 'hidden';   // 초기 숨김
    container.style.fontSize = '14px';
    container.style.boxSizing = 'border-box';
    container.style.padding = '0';
    container.style.color = '#fff';
    container.style.pointerEvents = 'auto';  // 자식 포커스 가능
    document.body.appendChild(container);

    // --- CSS 클래스 ---
    const style = document.createElement('style');
    style.textContent = `
        .autocomplete-item {
            color: #fff;
            background: #000;
            padding: 8px 10px;
            cursor: pointer;
            border-bottom: 1px solid #333;
        }
        .autocomplete-item-focused {
            outline: 4px solid #FFD700 !important;
            outline-offset: 0px !important;
            background-color: #552E00 !important;
            box-shadow:
                0 0 0 400px #552E00 inset,
                0 0 400px rgba(255, 215, 0, 1) !important;
            transition: outline-color 0.2s, box-shadow 0.2s;
            color: #fff;
        }
    `;
    document.head.appendChild(style);

    let suggestions = [];
    let currentIndex = -1;

    function updatePosition() {
        const rect = input.getBoundingClientRect();
        container.style.left = rect.left + 'px';
        container.style.top = rect.bottom + 'px';
        container.style.width = rect.width + 'px';
    }

    setTimeout(updatePosition, 300);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    // --- TMDB 데이터 수신 (네이티브 앱) ---
    function fetchTMDB(query) {
        if (!query) {
            container.style.visibility = 'hidden';
            return;
        }
        if (window.NativeApp && typeof window.NativeApp.searchTmdb === 'function') {
            window.NativeApp.searchTmdb(query);
        }
    }

    window.receiveTmdbData = function(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            suggestions = (data.results || [])
                .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
                .slice(0, 10);
            renderSuggestions();
        } catch (e) {
            console.error("JSON 파싱 에러:", e);
        }
    };

    // --- 렌더링 ---
    function renderSuggestions() {
        container.innerHTML = '';
        currentIndex = -1;

        if (!suggestions.length) {
            container.style.visibility = 'hidden';
            return;
        }

        suggestions.forEach((item, idx) => {
            const row = document.createElement('div');
            row.textContent = item.title || item.name;
            row.tabIndex = 0;
            row.classList.add('autocomplete-item');

            row.addEventListener('mouseenter', () => highlight(idx));
            row.addEventListener('mouseleave', () => unhighlight(idx));
            row.addEventListener('click', () => {
              input.value = item.title || item.name;
              container.style.visibility = 'hidden';
              const form = input.closest('form');
              if (form) form.submit();
              });

            container.appendChild(row);
        });

        updatePosition();
        container.style.visibility = 'visible';
    }

    function highlight(idx) {
        [...container.children].forEach((row, i) => {
            row.classList.toggle('autocomplete-item-focused', i === idx);
        });
        currentIndex = idx;
    }

    function unhighlight(idx) {
        if (container.children[idx]) {
            container.children[idx].classList.remove('autocomplete-item-focused');
        }
    }

    // --- 키보드 이벤트 ---
    let debounceTimer;
    input.addEventListener('keyup', e => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchTMDB(input.value), 300);
    });

    // --- 외부 클릭 시 닫기 ---
    document.addEventListener('mousedown', e => {
        if (!container.contains(e.target) && e.target !== input) {
            container.style.visibility = 'hidden';
        }
    });
	
	*/

})();
//Monkey 지원 웹브라우저
(function() {
  if (!isWebBrowser) return;

  const TMDB_API_KEY = '8c0ffa89de81017aeee4dba11012b5d6';
  const input = document.querySelector('#sch_stx');
  const searchWrap = document.querySelector('.search_wrap')

  if (!input) {
      console.log("[Autocomplete] 검색창(#sch_stx) 없음");
      return;
  }

  if (!searchWrap) {
      console.log("[Autocomplete] 검색창(#sch_stx) 없음");
      return;
  }

  // 검색창의 부모 요소에 컨테이너 추가
  //const parent = input.parentElement || document.body;
  const parent = searchWrap.parentElement || document.body;
  const container = document.createElement('div');
  container.id = "autocomplete_parent"
  container.style.position = 'fixed';  // fixed로 변경
  container.style.background = '#000000';
  container.style.border = '1px solid #ccc';
  container.style.maxHeight = '250px';
  container.style.overflowY = 'auto';
  container.style.zIndex = '999999';   // 최상단
  container.style.display = 'none';
  container.style.fontSize = '14px';
  container.style.boxSizing = 'border-box';
  container.style.padding = '0';
  container.style.margin = '0';
  container.setAttribute('tabindex', '-1');
  container.style.pointerEvents = 'none';

  parent.appendChild(container);

  let suggestions = [];
  let currentIndex = -1;

  // 위치 업데이트 (fixed 기준 → 화면상의 절대 좌표)
  function updatePosition() {
      const rect = input.getBoundingClientRect();
      container.style.left = rect.left + 'px';
      container.style.top = (rect.bottom) + 'px';
      container.style.width = rect.width + 'px';
  }

  // DOM 렌더 완료 후 위치 정확히 계산
  setTimeout(updatePosition, 300);
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition);


  // TMDB 검색 함수
  function fetchTMDB(query) {
      if (!query) {
          container.style.display = 'none';
          return;
      }

      GM_xmlhttpRequest({
          method: 'GET',
          url: `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=ko-KR&query=${encodeURIComponent(query)}`,
          onload: function(res) {
              const data = JSON.parse(res.responseText);
              suggestions = (data.results || [])
                  .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
                  .slice(0, 10);

              renderSuggestions();
          }
      });
  }

  // 자동완성 리스트 렌더링
  function renderSuggestions() {
      container.innerHTML = '';
      currentIndex = -1;

      if (suggestions.length === 0) {
          container.style.display = 'none';
          return;
      }

      suggestions.forEach((item, idx) => {
          const row = document.createElement('div');
          row.className = "autocomplete_child";
          row.textContent = item.title || item.name;
          row.style.padding = '8px 10px';
          row.style.cursor = 'pointer';
          row.style.background = '#111111';
          row.setAttribute('tabindex', '0');

          row.addEventListener('mouseenter', () => highlight(idx));
          row.addEventListener('mouseleave', () => unhighlight(idx));
          row.addEventListener('click', () => {
              input.value = item.title || item.name;
              container.style.display = 'none';
          });

          container.appendChild(row);
      });

      updatePosition(); // 위치 재확인
      container.style.display = 'block'; // 강제 표시
  }

  function highlight(idx) {
      [...container.children].forEach((row, i) => {
          row.style.background = i === idx ? '#552E00' : '#000000';
      });
      currentIndex = idx;
  }

  function unhighlight(idx) {
      container.children[idx].style.background = '#000000';
  }



  input.addEventListener('keyup', (e) => {
      const key = e.key;
      fetchTMDB(input.value);
  });



  // 외부 클릭 시 닫기
  document.addEventListener('mousedown', (e) => {
      if (!container.contains(e.target) && e.target !== input) {
          container.style.display = 'none';
      }
  });





})();
// ==============================================================================================================
// ==============================================================================================================

console.log("UserSciprt Process : 8");





//재생 페이지 진입시 비디오 영역, 재생 버튼 숨기고, 로드 완료되면 표시: TV(O)::Phone(O)::Web(X)
(function() {
	if (isWebBrowser) return;//일반 웹브라우저에서는 숨기지 않음
	if (pageNumber < 2) return;//재생페이지가 아니면 숨기지 않음
	
	//재생 버튼 탈출 시 포커스 효과를 제거하는 함수
	function removePlayButtonFocusEffect() {
    const playButton = document.getElementById("playButton");
    if (!playButton) return;

    playButton.style.removeProperty("z-index");
    playButton.style.removeProperty("outline");
    playButton.style.removeProperty("outline-offset");
    playButton.style.removeProperty("box-shadow");
    playButton.style.removeProperty("transition");

    // 생성 시의 원래 배경색으로 복원
    playButton.style.backgroundColor = "#ff0000";
}
	
	//재생 버튼 탈출을 위한 함수
	function moveFocusFrom(current, direction) {
		const currentRect = current.getBoundingClientRect();

		const candidates = [...document.querySelectorAll(
			'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
		)].filter(el =>
			el !== current &&
			el.offsetParent !== null // 화면에 보이는 요소만
		);

		let best = null;
		let bestDistance = Infinity;

		for (const el of candidates) {
			const r = el.getBoundingClientRect();

			let valid = false;

			switch (direction) {
				case "ArrowUp":
					valid = r.bottom <= currentRect.top;
					break;
				case "ArrowDown":
					valid = r.top >= currentRect.bottom;
					break;
				case "ArrowLeft":
					valid = r.right <= currentRect.left;
					break;
				case "ArrowRight":
					valid = r.left >= currentRect.right;
					break;
			}

			if (!valid) continue;

			const dx = (r.left + r.width / 2) - (currentRect.left + currentRect.width / 2);
			const dy = (r.top + r.height / 2) - (currentRect.top + currentRect.height / 2);
			const distance = Math.hypot(dx, dy);

			if (distance < bestDistance) {
				bestDistance = distance;
				best = el;
			}
		}
		
		removePlayButtonFocusEffect();

		if (best) {
			best.focus({ preventScroll: true });
			best.scrollIntoView({
				block: "nearest",
				inline: "nearest",
				behavior: "auto"
			});
		} else {
			switch (direction) {
				case "ArrowUp":
					window.scrollBy({ top: -150, behavior: "auto" });
					break;

				case "ArrowDown":
					window.scrollBy({ top: 150, behavior: "auto" });
					break;
			}
		}
	}

	//재생 버튼 생성
	const container = document.querySelector('div.watch-player');
	if (container) {
		// 새로운 컨테이너 생성
		const overlay = document.createElement('div');
		overlay.className = 'bo_v_mov_overlay';

		// overlay 스타일 수정
		overlay.style.width = '100%';
		const overlayHeight = (isRunningOnTv) ? '310px' : '240px';
		overlay.style.setProperty('height', overlayHeight, 'important');

		// **가운데 정렬**
		overlay.style.display = 'flex';
		overlay.style.alignItems = 'center';     // 세로 중앙
		overlay.style.justifyContent = 'center'; // 가로 중앙

		// 버튼 생성
		const playButton = document.createElement('button');
		playButton.id = 'playButton';
		const playButtonWidth = (isRunningOnTv) ? "180px" : "120px";
		const playButtonHeight = (isRunningOnTv) ? "80px" : "60px";
		const playButtonFontSize = (isRunningOnTv) ? "24px" : "20px";
		playButton.textContent = '▶ 재생';
		playButton.style.cssText = `
			background-color: #ff0000;
			color: white;
			border: none;
			border-radius: 4px;
			font-size: ${playButtonFontSize};
			font-weight: bold;
			cursor: pointer;
			width: ${playButtonWidth};
			height: ${playButtonHeight};
			display: none;
			align-items: center;
			justify-content: center;
		`;

		overlay.appendChild(playButton);
		container.insertAdjacentElement('afterend', overlay);

		// 클릭 이벤트
		playButton.onclick = () => {
		if (typeof NativeApp !== 'undefined' && NativeApp.handlePlayButtonClick) {
			NativeApp.handlePlayButtonClick();
			sendWatchListAddSignToNative();
		}
		else {
			document.querySelector('.bo_v_mov_overlay').remove();
			const bovmov = document.querySelector('.bo_v_mov');
			bovmov.style.setProperty('height', '480px', 'important');
			bovmov.style.setProperty('display', 'block', 'important');
		}
	};

    // 재생 버튼 이벤트 바인딩 부분 수정
    const handlePlayAction = (e) => {
        // 1. 기본 동작 및 이벤트 전파 즉시 차단 (리모컨 Enter 키 중복 방지)
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }

        // 2. 포커스 강제 해제
        //playButton.blur();
        //window.focus(); // 윈도우로 포커스를 한 번 뺐다가 네이티브가 가져가게 함

        if (typeof NativeApp !== 'undefined' && NativeApp.handlePlayButtonClick) {
            // 3. 약간의 지연 후 네이티브 호출 (JS 스택이 비워진 후 네이티브가 동작하도록)
		  //NativeApp.handlePlayButtonClick();
          sendWatchListAddSignToNative();
		  
		  const target = document.querySelector('iframe');
          target.focus();
		  
        } else {
            // Fallback 로직
            const overlay = document.querySelector('.bo_v_mov_overlay');
            if (overlay) overlay.remove();
            const bovmov = document.querySelector('.bo_v_mov');
            if (bovmov) {
                bovmov.style.setProperty('height', '480px', 'important');
                bovmov.style.setProperty('display', 'block', 'important');
            }
        }
    };



    // 마우스 클릭 대응
    playButton.onclick = handlePlayAction;
	playButton.onfocus = () => {
		const iframe = document.querySelector('iframe');

		if (iframe) {
			iframe.focus();
		}

		playButton.style.setProperty("z-index", "9999", "important");
		playButton.style.setProperty("background-color", "#552E00", "important");
		playButton.style.setProperty("outline", "4px solid #FFD700", "important");
		playButton.style.setProperty("outline-offset", "0px", "important");
		playButton.style.setProperty(
			"box-shadow",
			"0 0 0 400px #552E00 inset, 0 0 400px rgba(255, 215, 0, 1)",
			"important"
		);
		playButton.style.setProperty(
			"transition",
			"outline-color 0.2s, box-shadow 0.2s",
			"important"
		);
	};
	


    // 리모컨/키보드 대응 (Enter 또는 Space가 기본 클릭을 유발하지만, 명시적으로 제어)
    playButton.onkeydown = (e) => {
        if (e.keyCode === 13 || e.keyCode === 32) { // Enter or Space
            handlePlayAction(e);
        }
    };


  }

	//로딩서클 오버레이
	if (container) {
    //로딩중 오버레이
    const loadingOverlaystyle = document.createElement('style');
    loadingOverlaystyle.textContent = `
    #userscript-loading-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.9);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
    }

	#userscript-loading-spinner {
		width: 68px;
		height: 68px;
		border: 6px solid transparent;  /* 전체 두께, 투명 */
		border-top-color: #00FF00;       /* 12시 방향 */
		border-right-color: #00FF00;     /* 3시 방향 */
		border-bottom-color: #00FF00;    /* 6시 방향 */
		border-radius: 50%;
		animation: userscript-spin 1s linear infinite;
	}


    @keyframes userscript-spin {
        to { transform: rotate(360deg); }
    }
    `;
    document.head.appendChild(loadingOverlaystyle);

    if (document.getElementById('userscript-loading-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'userscript-loading-overlay';

    const spinner = document.createElement('div');
    spinner.id = 'userscript-loading-spinner';

    overlay.appendChild(spinner);
    document.body.appendChild(overlay);

    }
	
	//기존 비디오 영역 숨기기
	const movDiv = document.querySelector('.watch-player');
	if (!movDiv) return;
	movDiv.style.setProperty('height', '0px', 'important');
	movDiv.style.setProperty('display', 'flex', 'important');

	//Post Message 수신 받기
	window.addEventListener('message', (event) => {
		//재생 버튼 표시하고 오버레이 지우기
		if (event.data?.action === "VIDEO_READY") {			
			const playButton = document.getElementById('playButton');
			playButton.style.display = 'flex';
			const overlay = document.getElementById('userscript-loading-overlay');
			if (overlay) overlay.remove();				
			//clearInterval(interval);				
		}
		
		//재생 버튼에서 탈출하기 위한 메시지
		else if (event.data?.action === "IFRAME_MOVE_FOCUS") {
			const current = document.getElementById("playButton");
			if (!current) return;	
			moveFocusFrom(current, event.data.direction);
		}
		
		//시청 목록 만들기
		else if (event.data?.action === "sendWatchListAddSignToNative") {
			sendWatchListAddSignToNative();
		}		
	});
})();
//비디오 플레이어의 워터마크 사용 여부 판단
(function () {

	if (pageNumber < 2) return;//재생페이지가 아니면 사용하지 않음
    // 등록일 체크
    const text = document.querySelector('.profile_info_ct li')?.textContent || '';

    const match = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);

    if (!match) {
        console.log('등록된 날짜를 찾을 수 없음');
        return;
    }

    const dateNum = Number(`${match[1]}${match[2]}${match[3]}`);

    if (dateNum <= 20260203) {
        console.log('조건 불일치');
        return;
    }

    console.log('조건 일치');

    const iframe = document.getElementById('view_iframe');

    if (!iframe) {
        console.log('iframe 없음');
        return;
    }

    // 반복 전송 시작
    const interval = setInterval(() => {
        //console.log('STOP_WATERMARK_BLUR 전송');
        iframe.contentWindow?.postMessage(
            {
                type: 'STOP_WATERMARK_BLUR'
            },
            '*'
        );

    }, 500);

    // 자식 ACK 수신
    window.addEventListener('message', (event) => {

        console.log('부모 message 수신:', event.data);

        if (event.data?.type === 'STOP_WATERMARK_BLUR_ACK') {

            console.log('ACK 수신 → 반복 중지');

            clearInterval(interval);
        }

    });

})();
// 메인 페이지 재구성: TV(O)::Phone(X)::Web(X)
(function () {
    'use strict';
    if (pageNumber !== 0) return;
    if (!isRunningOnTv) return;

    const links = [
        '/browse/kor_movie',
        '/browse/drama',
        '/browse/old_drama',
        '/browse/ent',
        '/browse/old_ent',

        '/browse/movie',
        '/browse/world',
        '/browse/sisa',
        '/browse/ott_ent',
        '/browse/animation'
    ];

    const names = [
		'한국 영화',
        '한국 드라마',
		'한국 드라마\n(종영)',
		'한국 예능',
		'한국 예능\n(종영)',		
        '외국 영화',
        '외국 드라마',
        '시사 / 다큐',
        '해외\n시사 / 다큐',
        '애니메이션',
    ];

    // 기존 레이아웃 제거
    const bodyWrap = document.getElementById('body_wrap');
    if (bodyWrap) bodyWrap.remove();

    // 기존 TV 레이아웃이 있다면 제거
    const oldContainer = document.querySelector('.tv-container');
    if (oldContainer) oldContainer.remove();

    // 스타일 주입
    const style = document.createElement('style');

    style.textContent = `
        html,
        body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
            background: #141414 !important;
        }

        .tv-container {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            background: #141414;

            display: flex;
            align-items: center;
            justify-content: center;

            z-index: 999999;
        }

        .tv-grid {
            display: grid;

            /* 5개 × 2줄 */
            grid-template-columns: repeat(5, 1fr);
            grid-template-rows: repeat(2, 1fr);

            gap: 12px;

            width: 92%;
            max-width: 1600px;

            /* TV 화면에서 2줄 높이를 안정적으로 유지 */
            height: 70%;
        }

        .tv-card {
			white-space: pre-line;

            min-width: 0;
            min-height: 0;

            border-radius: 12px;

            background: #2a2a2a;

            display: flex;
            align-items: center;
            justify-content: center;

            font-size: 24px;
            font-weight: 700;

            color: #ffffff;

            cursor: pointer;
            user-select: none;
            text-align: center;

            outline: none;

            /* GPU 레이어 */
            transform: translateZ(0);

            /* 기존 0.2s → 0.06s */
            transition:
                transform 0.06s linear,
                background-color 0.06s linear;

            will-change: transform;
        }

        .tv-card:focus {
            transform: scale(1.05) translateZ(0);
            background: #3a3a3a;
        }

        /* hover는 TV WebView에서 불필요하므로 제거 */
        .tv-card:hover {
            transform: none;
        }
    `;

    document.head.appendChild(style);

    function createLayout() {

        const fragment = document.createDocumentFragment();

        const container = document.createElement('div');
        container.className = 'tv-container';

        const grid = document.createElement('div');
        grid.className = 'tv-grid';

        let firstCard = null;

        for (let i = 0; i < names.length; i++) {

            const card = document.createElement('div');

            card.className = 'tv-card';
            card.tabIndex = 0;
            card.textContent = names[i];

            if (i === 0) {
                firstCard = card;
            }

            card.addEventListener('click', () => {

                location.href =
                    "https://hoohootv1.org" + links[i];
            });

            grid.appendChild(card);
        }

        container.appendChild(grid);
        fragment.appendChild(container);

        // DOM 삽입
        document.body.appendChild(fragment);

        // 첫 번째 카드 포커스
        if (firstCard) {
            requestAnimationFrame(() => {
                firstCard.focus({
                    preventScroll: true
                });
            });
        }
    }

    createLayout();

})();
//개발자 도구 차단 스크립트 무효화
(function () {

	const removeDisableDevtool = () => {
	  document.querySelectorAll('script[src*="disable-devtool"]').forEach(s => s.remove());
	};
	// 2) 동적 삽입 감시
	const mo = new MutationObserver(mutations => {
	  for (const m of mutations) {
		  for (const n of m.addedNodes) {
			  if (
				  n.tagName === 'SCRIPT' &&
				  n.src &&
				  n.src.includes('disable-devtool')
			  ) {
				  n.remove();
			  }
		  }
	  }
	});
	mo.observe(document.documentElement, {
	  childList: true,
	  subtree: true
	});
	removeDisableDevtool();
})();
//후후티비 레이아웃 변경
(function () {
    'use strict';

    function rebuild() {

        // 카테고리별 페이지
        const filterBar = document.querySelector('.filter-bar');
        const posterGrid = document.querySelector('.poster-grid.catalog-grid');
        const pagination = document.querySelector('.pagination');

        // 재생 페이지
        const watchHero = document.querySelector('.watch-hero');
        const watchH1 = document.querySelector('.watch-copy h1');
        const watchKicker = document.querySelector('.watch-kicker');

        // CSS 수정
        const style = document.createElement('style');
        style.textContent = `
            /* 페이지 전체 여백 제거 */
            html,
            body {
                margin: 0 !important;
                padding: 0 !important;
            }

			/* watch-page의 왼쪽 여백 제거 */
			.watch-page,
			.page-shell.catalog-page {
				margin-left: 0 !important;
			}
			
			page-shell catalog-page

            /* 옮긴 제목 */
            .watch-hero > h1 {
                margin-left: 35px !important;
                margin-bottom: 30 !important;
            }

            /* 제목 바로 아래 요소의 여백 제거 */
            .watch-hero > h1 + * {
                margin-top: 0 !important;
                padding-top: 0 !important;
            }

            /* watch-kicker 높이 제거 */
            .watch-kicker {
                height: 0 !important;
                overflow: hidden !important;
            }

            /* 회차 날짜 제거 */
            .episode-item span {
                display: none !important;
            }

            /* 회차 번호 가운데 정렬 */
            .episode-item {
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
            }

            /* 회차 번호 글씨 크기 */
            .episode-item strong {
                font-size: 20px !important;
            }
        `;

        document.head.appendChild(style);

        // 재생 페이지 제목을 watch-hero의 최상단으로 이동
        if (watchHero && watchH1) {

            watchHero.prepend(watchH1);

            // 영상만 재생하는 페이지가 아니라면 회차 정보 추가
            if (!isOnlyVideo && watchKicker) {

                const kickerText = watchKicker.textContent.trim();

                // "드라마 · 11화"에서 "11화"만 추출
                const match = kickerText.match(/(\d+화)/);

                if (match) {
                    watchH1.textContent += ' ' + match[1];
                }
            }
			
			thisEpisodeTitle = watchH1.textContent;
        }

        // 필요한 요소가 아직 로드되지 않았다면 대기
        if (!filterBar && !posterGrid && !pagination) {
            return;
        }

        // 기존 body의 모든 내용 제거
        document.body.innerHTML = '';

        // 원하는 순서대로 body에 추가
        if (filterBar) {
            document.body.appendChild(filterBar);
        }

        if (posterGrid) {
            document.body.appendChild(posterGrid);
        }

        if (pagination) {
            document.body.appendChild(pagination);
        }
    }

    // DOM이 만들어진 후 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', rebuild);
    } else {
        rebuild();
    }

})();
// 검색창 추가
(function () {
    'use strict';

    // Kotlin에서 호출
    window.openSearch = function () {

        // 이미 검색창이 열려 있으면 input에 포커스
        if (document.getElementById('userscript-search')) {
            document.getElementById('userscript-search-input')?.focus();
            return;
        }

        // 검색창 CSS
        const style = document.createElement('style');
        style.id = 'userscript-search-style';

        style.textContent = `
            #userscript-search {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);

                display: flex;

                padding: 20px;

                background: #222;
                border: 2px solid #555;
                border-radius: 10px;

                z-index: 999999;
            }

            #userscript-search-input {
                width: 500px;
                height: 60px;

                padding: 0 15px;
                box-sizing: border-box;

                border: none;
                border-radius: 5px;

                background: #222 !important;
                color: #fff !important;

                font-size: 26px;
                outline: none;

                caret-color: #fff;
            }

            #userscript-search-input::placeholder {
                color: #fff !important;
                opacity: 0.6;
            }

            #userscript-search-input:focus {
                outline: 3px solid #FFD700;
            }
        `;

        document.head.appendChild(style);


        // 검색창 생성
        const searchBox = document.createElement('div');
        searchBox.id = 'userscript-search';

        searchBox.innerHTML = `
            <input
                id="userscript-search-input"
                type="text"
                placeholder="검색어를 입력하세요"
                autocomplete="off"
            >
        `;

        document.body.appendChild(searchBox);


        const input =
            document.getElementById(
                'userscript-search-input'
            );


        // ============================================
        // 검색
        // ============================================

        function search() {

            const keyword =
                input.value.trim();

            if (!keyword) {

                input.focus();

                return;
            }


            const url =
                'https://hoohootv1.org/search.php?q=' +
                encodeURIComponent(keyword);


            location.href = url;
        }


        // ============================================
        // DPAD CENTER / Enter
        // ============================================

        input.addEventListener('keydown', (e) => {

            const isSearchKey =
                e.key === 'Enter' ||
                e.code === 'Enter' ||
                e.code === 'NumpadEnter' ||
                e.key === 'Select' ||
                e.keyCode === 23 ||   // DPAD CENTER
                e.keyCode === 66;     // ENTER


            if (isSearchKey) {

                e.preventDefault();
                e.stopPropagation();

                search();

                return;
            }
        });


        // ============================================
        // 입력값 확인
        // ============================================

        input.addEventListener('input', () => {

            if (
                typeof NativeApp !== 'undefined' &&
                NativeApp.jsLog
            ) {

                NativeApp.jsLog(
                    '검색 입력값: ' +
                    input.value
                );
            }
        });


        // ============================================
        // 검색창이 열리면 input 포커스
        // ============================================

        requestAnimationFrame(() => {

            input.focus();

        });
    };

})();
//마무리 디버그
(function () {
	if (isWebBrowser) return;
	NativeApp.jsLog("UserScript 로드 완료");
	const now = performance.now();
	NativeApp.jsLog(`경과 시간: ${now.toFixed(3)} ms`);
})();




