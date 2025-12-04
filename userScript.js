// ==UserScript==
// @name        tvFlixUserScirpt
// @include     /^https?:\/\/[^/]*tvwiki[^/]*\/.*$/
// ==/UserScript==
//
// =======================================================
// 이 스크립트의 목적
// =======================================================
// 1. 웹사이트 내 불필요한 요소 포커스 비활성화
// 2. 웹사이트 요소 제거
// 3. 웹사이트 요소 추가
// 4. 웹사이트 요소 변경
// 5. 네이티브에서 호출할 함수
// 6. 기타

const mainPageUrl = "tvwiki4.net";
const scriptVersion = "2512041726";
const isRunningOnTv = (navigator.userAgent.includes("DeviceType/TV"));

// =======================================================
// 1. 웹사이트 내 불필요한 요소 포커스 비활성화
// =======================================================
(function() {
  'use strict';
  // .slide_wrap 내부의 '.title'을 제외한 모든 요소의 포커스 비활성화
  document.querySelectorAll('.slide_wrap *').forEach(element => {
  if (element.classList && !element.classList.contains('title') && !element.classList.contains('more')) {
    element.setAttribute('tabindex', '-1');
      }
  });

  // 기존의 기타 포커스 비활성화 로직 (안전을 위해 유지)
  document.querySelectorAll('a.img, img, img.lazy, iframe, body').forEach(element => {
      element.setAttribute('tabindex', '-1');
  });

  const formElement = document.getElementById('fboardlist');
  if (formElement) {
    formElement.setAttribute('tabindex', '-1');
  }
  const searchElement= document.getElementById('sch_submit');
  if (searchElement) {
    searchElement.setAttribute('tabindex', '-1');
  }
})();
// =======================================================
// =======================================================
// =======================================================






// =======================================================
// 2. 웹사이트 요소 제거
// =======================================================
(function() {
  'use strict'

  // =======================================================
  // 2. UI 요소 제거
  // =======================================================
  const elementsToRemove = [
      'div.notice', 'a.logo', '.gnb_mobile', '.top_btn', '.profile_info_ct',
      '.ep_search', '.good', '.emer-content', '#bo_v_atc', '.cast',
      '.view-comment-area', '.over', '#bo_v_act', '#bo_vc', '#float',
      'div.notice', 'ul.banner2', 'li.full.pc-only', 'li.full.mobile-only',
      'nav.gnb.sf-js-enabled.sf-arrows', 'a.btn_login', '#bnb', '#footer', '.search_wrap ul', '.layer-footer', '.genre', '#other_list ul li p', '#footer_wrap'
  ];

  elementsToRemove.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
          element.remove();
      });
  });
  // 메인 페이지('/')가 아닌 하위 페이지일 경우 #header_wrap (로고, 검색버튼)을 삭제
  const pathname = window.location.pathname;
  // '/'로 분리 후 빈 문자열 제거
  const pathSegments = pathname.split('/').filter(seg => seg !== '');
  // pathSegments 길이로 깊이 판단
  // pathSegments.length > 1이면 서브서브 페이지
  if (pathSegments.length > 1) {
      const headerWrap = document.getElementById('header_wrap');
      if (headerWrap) {
          headerWrap.remove();
      }
  } else {
      // 메인 페이지 또는 서브페이지일 때 실행
      const headerWrap = document.getElementById('header_wrap');
      if (headerWrap) {
          headerWrap.style.height = '80px';
      }

      // 검색 버튼 수직 중앙 정렬
      const headerElement = document.getElementById('header');
      if (headerElement && headerElement.parentElement) {
          const parent = headerElement.parentElement;
          parent.style.display = 'flex';
          parent.style.alignItems = 'center';
      }
  }

  // '.bo_v_tit' 요소에서 '다시보기' 텍스트 제거
  document.querySelectorAll('.bo_v_tit').forEach(element => {
      // 정규 표현식을 사용하여 모든 '다시보기' 문자열을 빈 문자열로 대체하고 앞뒤 공백 제거
      if (element.textContent.includes('다시보기')) {
          element.textContent = element.textContent.replace(/다시보기/g, '').trim();
      }
  });

  // 홈화면의 첫 번째 '.slide_wrap' 제거
  const firstSlideWrap = document.querySelector('.slide_wrap');
  if (firstSlideWrap) {
      firstSlideWrap.remove();
  }
  // 남은 Slide Wrap 제목 변경 로직
  const slideWraps = document.querySelectorAll('.slide_wrap');
  const newTitles = ['드라마', '영화', '예능', '애니메이션'];
  slideWraps.forEach((wrap, index) => {
      if (index < newTitles.length) {
          const h2 = wrap.querySelector('h2');
          if (h2) {
              const moreLink = h2.querySelector('a.more');
              const newTitleText = newTitles[index];

              if (moreLink) {
                  h2.innerHTML = `${newTitleText}${moreLink.outerHTML}`;
              } else {
                  h2.textContent = newTitleText;
              }
          }
      }
  });

  //재생 페이지에서 회차 썸네일 제거
  // class가 searchText로 시작하는 모든 li 선택
  const liElements = document.querySelectorAll('li[class^="searchText"]');
  liElements.forEach(li => {
      const img = li.querySelector('img');
      if (img) {
          img.remove();
      }
  });


  //재생 페이지에서 회차가 하나밖에 없는 경우, 회차 영역 전체를 제거
  const target = document.querySelector('#other_list');
  if (target) {
    const ul = target.querySelector('ul');
    if (ul) {
      const items = ul.querySelectorAll('li');
      if (items.length <= 1) {
        target.remove();
      }
    }
  }

  // =======================================================

})();
// =======================================================
// =======================================================
// =======================================================






// =======================================================
// 3. 웹사이트 요소 추가
// =======================================================
(function() {
  'use strict'
  // 검색 버튼 텍스트 추가 로직 및 인라인 스타일 강제 오버라이드
  const searchButton = document.querySelector('a.btn_search');
  if (searchButton) {

      // 1. 텍스트를 담을 span 요소를 생성
      const searchLabel = document.createElement('span');
      searchLabel.textContent = ' 검색 ';
      searchLabel.classList.add('search-label');

      // 2. 폰트 크기를 인라인 스타일로 강제 적용 (가장 높은 우선순위)
      searchLabel.style.setProperty('font-size', '24px', 'important'); // <<-- 최종 폰트 크기 강제 적용

    // 3. 버튼 아이콘 앞에 텍스트 추가
      searchButton.prepend(searchLabel);
  }

  // 재생 페이지'.bo_v_mov'에 '동영상 재생하기' 버튼 추가 및 스타일 적용
  document.querySelectorAll('div.bo_v_mov').forEach(container => {
    // 새로운 컨테이너 생성
    const overlay = document.createElement('div');
    overlay.className = 'bo_v_mov_overlay';


    // overlay 스타일 수정
    //overlay.style.position = 'relative';
    overlay.style.width = '100%';
    overlay.style.setProperty('height', '360px', 'important');


    // **가운데 정렬**
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';     // 세로 중앙
    overlay.style.justifyContent = 'center'; // 가로 중앙

    // 버튼 생성
    const playButton = document.createElement('button');
    playButton.textContent = '▶ 재생';
    playButton.style.cssText = `
        background-color: #ff0000;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 24px;
        font-weight: bold;
        cursor: pointer;
        width: 180px;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    overlay.appendChild(playButton);
    container.insertAdjacentElement('afterend', overlay);

    /*

    // 컨테이너 높이가 변하면 overlay도 자동 조정
    const adjustHeight = () => {
        overlay.style.height = `${container.getBoundingClientRect().height}px`;
    };
    const observer = new MutationObserver(adjustHeight);
    observer.observe(container, { attributes: true, childList: true, subtree: true });

    */

    // 클릭 이벤트
    playButton.onclick = () => {
        if (typeof NativeApp !== 'undefined' && NativeApp.handlePlayButtonClick) {
            NativeApp.handlePlayButtonClick();
        }
        else {

        }

    };
});

  //특수 포커스 효과(TV에서만 적용, 모바일은 적용하지 않음)
  const userAgentString = navigator.userAgent;
  if (isRunningOnTv) {
      let focusOverlay = null;
  document.addEventListener('focusin', (e) => {
      const target = e.target.closest && e.target.closest('.title, .title2, .filter_layer a, .filter2_layer a');
      if (!target) return;
      const parentDiv = target.parentElement;
      const isSearchPageItem = parentDiv && parentDiv.tagName === 'DIV' && parentDiv.classList.contains('con');// 검색 결과창 페이지에서의 title이라면(그렇다면 길이를 다른 title과는 다르게 취급해야함)
      const isDropDownItem = e.target.closest('.filter_layer a, .filter2_layer a');
      const rect = target.getBoundingClientRect();

      // 원본 투명화
      target.style.opacity = '0';

      // overlay 생성
      focusOverlay = document.createElement('div');
      focusOverlay.textContent = target.textContent;

      // 공통 스타일
      Object.assign(focusOverlay.style, {
          position: 'absolute',
          top: isSearchPageItem ? `${rect.top + window.scrollY -30}px`: `${rect.top + window.scrollY}px`,
          left: `${rect.left + window.scrollX}px`,
          width: isSearchPageItem ? '65%' : `${rect.width}px`,
          height: isDropDownItem ? `${rect.height}px` : `${rect.height + 30}px`,
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
          transition: 'outline-color 0.2s, box-shadow 0.2s',
      });

      // 글꼴 스타일 원본 복사
      const cs = window.getComputedStyle(target);
      focusOverlay.style.fontSize = cs.fontSize;
      focusOverlay.style.fontFamily = cs.fontFamily;

      document.body.appendChild(focusOverlay);
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target;

    // 원본 복원
    el.style.opacity = '';

    // 오버레이 제거
    if (focusOverlay) {
        focusOverlay.remove();
        focusOverlay = null;
    }
});

  }



})();
// =======================================================
// =======================================================
// =======================================================






// =======================================================
// 4. 웹사이트 요소 변경
// =======================================================
(function() {
  'use strict'

  // =======================================================
  // 4. UI 요소 변경
  // =======================================================
  // D-Pad 포커스 테두리 (Outline) 스타일 개선 및 UI 조정 CSS
  const style = document.createElement('style');
  style.innerHTML = `
      /* 🚨 [위치 최종 수정] 커스텀 알림 모달 스타일: 뷰포트 고정(Fixed) 및 중앙 정렬 */
      .custom-alert-backdrop {
          position: fixed !important; /* 뷰포트에 고정되어 스크롤 시 따라옴 */
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          background-color: rgba(0, 0, 0, 0.7) !important;
          z-index: 10000 !important; /* Z-index를 높게 설정 */
          display: block !important;
          /* 렌더링 최적화를 위한 힌트 추가 (종종 Fixed 버그 해결에 도움) */
          will-change: transform, opacity;
      }
      .custom-alert-modal {
          /* 모달 자체를 중앙에 위치시킵니다. */
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          z-index: 10001 !important; /* 배경보다 한 단계 더 높게 */

          background: #2c2c2c; /* 다크 모드 배경 */
          color: #f0f0f0; /* 밝은 텍스트 */
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          max-width: 400px;
          width: 90%;
          text-align: center;
          border: 2px solid #FFD700; /* 포커스 색상 */
      }
      .custom-alert-title {
          font-size: 1.5rem;
          font-weight: bold;
          margin-bottom: 15px;
          color: #FFD700;
      }
      .custom-alert-message {
          margin-bottom: 20px;
          font-size: 1rem;
          word-break: break-word;
      }
      .custom-alert-actions button {
          background-color: #555;
          color: white;
          border: none;
          padding: 10px 20px;
          margin: 0 5px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s, box-shadow 0.2s;
      }
      .custom-alert-actions button:focus,
      .custom-alert-actions button:hover {
          background-color: #FFD700;
          color: #111;
          outline: none;
          box-shadow: 0 0 10px rgba(255, 215, 0, 0.7);
      }




      /* 🚨 [새로운 수정] "전체보기" 링크를 오른쪽에서 띄우기 위한 스타일 */
      /* 이 링크는 h2 내부에 있으므로, 오른쪽 끝에서 20px의 여백을 줍니다. */
      .more {
          padding-right: 20px !important;
      }

      /* =========================================================== */
      /* [FIX 2] Title Link Font Size and Vertical Alignment */
      /* 높은 명시도로 폰트 크기 및 수직 정렬을 강제 적용합니다. */
      .owl-carousel .owl-item .title,
      .owl-carousel .owl-item .box a.title, a.more /* 명시도 확보를 위한 추가 셀렉터 */
      a.title {
          /* 1. 높이 유지 (50px) 및 수직 중앙 정렬을 위해 line-height를 높이와 동일하게 설정 */
          height: 50px !important;
          line-height: 50px !important;

          /* 2. 폰트 크기 키우기 (명시도 + 크기 강제) */
          font-size: 1.4em !important;
      }

      a.more {
          font-size: 0.9em !important;
      }

      h2 {
          font-size: 1.7em !important;
      }
      /* =========================================================== */

      /* (기존 포커스 및 UI 스타일 유지) */

      /* =========================================================== */
      /* [FIX] Owl Carousel: Restore Sliding, Keep Aspect Ratio (2:3 assumed) */


      /* 2. Owl Stage의 transform 및 width 초기화 제거 */
      /* -> Owl Carousel JS가 슬라이딩을 위해 설정하는 transform을 복구합니다. */


      /* 3. 이미지 컨테이너 (.img)에 비율 유지 핵 적용 (썸네일 비율 2:3 가정) */
      /* * 비율 유지를 위해 .img 요소에 padding-top: 150%만 적용 */
      .owl-carousel .owl-item .box > a.img {
          /* position: relative 필수: 자식 img가 absolute로 배치될 기준점 */
          position: relative !important;
          width: 100% !important;
          height: 0 !important; /* 높이는 padding-top으로 대체 */

          /* Aspect Ratio Hack: 가로 2 : 세로 3 (150%) 비율 유지 */
          padding-top: 150% !important;
          overflow: hidden !important;
          display: block !important;
      }

      /* 4. 비율 유지 컨테이너 내부의 이미지 크기 강제 */
      .owl-carousel .owl-item .box > a.img > img {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important; /* 이미지 잘림 없이 컨테이너에 맞춤 */
      }



      /* 5. 제목(.title) 높이도 줄어든 크기에 맞게 조정 */
      /* (이 부분은 비율과 관계 없지만 전체 세로 길이 축소를 위해 유지) */
      .owl-carousel .owl-item .title {
          height: 35px !important;
          line-height: 1.2 !important;
          font-size: 14px !important;
      }
      a.title2{
                  height: 35px !important;
          line-height: 1.2 !important;
          font-size: 19px !important;
      }

      /* =========================================================== */




      /* 모든 포커스 가능한 요소의 테두리 스타일을 재정의 */
      :focus {

          z-index: 9999 !important;
          background-color: #552E00 !important; /* 노란색 배경 */
          outline: 4px solid #FFD700 !important;
          outline-offset: 0px !important;

          box-shadow:
              0 0 0 400px #552E00 inset,
              0 0 400px rgba(255, 215, 0, 1) !important;

          transition: outline-color 0.2s, box-shadow 0.2s;
      }



      /* [NEW FIX: 부모 li 확장] #tnb 내부의 li에 걸린 고정 크기 및 float를 해제하여 버튼이 확장할 공간을 확보 */
      #header_wrap #header #tnb ul li {
          float: none !important;
          display: inline-block !important;
          width: auto !important;
          height: auto !important;
          min-width: unset !important;
          margin: 0 !important;
          padding: 0 !important;
      }











      /* [MAX SPECIFICITY FIX] ID 선택자를 모두 포함하여 명시도를 최상으로 높임 */
      #header_wrap #header #tnb ul li a.btn_search {
          /* Flexbox로 가로 정렬 강제 */
          display: flex !important;
          flex-direction: row !important;
          flex-wrap: nowrap !important; /* 줄바꿈 절대 금지 */
          align-items: center !important; /* 수직 중앙 정렬 */

          /* 너비/높이 고정값 무효화 및 내용물에 맞게 확장 */
          width: auto !important;
          height: auto !important;
          min-width: 0 !important; /* 최소 너비 제한 해제 */

          justify-content: flex-start !important;
          padding: 8px 15px !important;
          line-height: normal !important; /* 폰트 관련 문제 해결 */
          box-sizing: content-box !important; /* 패딩이 너비에 영향을 주지 않도록 함 */
      }

      /* 텍스트와 아이콘도 명시도를 높여서 가로 배치에 협조하도록 강제 */
      #header_wrap #header #tnb ul li a.btn_search span.search-label,
      #header_wrap #header #tnb ul li a.btn_search i {
          display: inline-block !important; /* Flex 아이템으로 잘 동작하도록 설정 */
          margin: 0 !important; /* 외부 마진 초기화 */
          padding: 0 !important; /* 외부 패딩 초기화 */
          white-space: nowrap !important;
          flex-shrink: 0 !important; /* 공간이 부족해도 축소되지 않도록 함 */
          line-height: 1 !important;
      }

      /* 텍스트와 아이콘 사이의 간격 재설정 */
      #header_wrap #header #tnb ul li a.btn_search span.search-label {
          margin-right: 8px !important;
          font-weight: bold;
          color: inherit;
          /* CSS도 충분히 높여서 혹시 모를 경우 대비 (JS에서 최종 오버라이드 됨) */
          font-size: 1.7em !important;
      }


#body_wrap {
    margin-top: 20px;
}

  `;
  document.head.appendChild(style);

  // 타이틀 변경
  document.title = "Netflix";
  const logoLink = document.querySelector("a.logo");
  if (logoLink) {
      const img = logoLink.querySelector("img");
      if (img) {
          img.src = "https://i.imgur.com/rBAwaXX.png";
          img.style.width = "110px";
          img.style.height = "auto";
      }
  }
  // 아이콘 변경 함수 호출
  const faviconURL = "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg";
  const appleIconURL = "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg";

  function replaceIcons() {
      document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach(el => el.remove());
      const icon = document.createElement('link');
      icon.rel = "icon";
      icon.type = "image/svg+xml";
      icon.href = faviconURL;
      document.head.appendChild(icon);
      const apple = document.createElement('link');
      apple.rel = "apple-touch-icon";
      apple.href = appleIconURL;
      document.head.appendChild(apple);
  }
  replaceIcons();

  // 재생 페이지의 플레이어 썸네일 자동 스킵
  const button = document.querySelector('a.btn.btn_normal');
  if (button) {
      button.click();
    NativeApp.jsLog("플레이어 재생 페이지 자동 넘기기 실행");
  }




})();
// =======================================================
// =======================================================
// =======================================================






// =======================================================
// 5. 네이티브에서 호출할 함수
// =======================================================
(function() {
  'use strict'

  window.handleBackButton = function() {
    // 1. 검색창에서 ESC, 뒤로가기 눌렀을 때 동작
    const isSearchLayerOpen = document.querySelector('.search_layer.active') !== null;// 검색창이 활성화 상태인지 여부 (true / false)
    if (isSearchLayerOpen){
      document.querySelector('.search_layer')?.classList.remove('active');
      document.querySelector('.search_wrap')?.classList.remove('active');

      // 현재 입력창 포커스 제거
      if (document.activeElement) {
          document.activeElement.blur();
      }

      // btn_search 버튼에 포커스 주기
      const btn = document.querySelector('.btn_search');
      if (btn) {
          btn.focus();
      }
      e.preventDefault();
      e.stopPropagation();
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
        const btn = document.querySelector('.filter2 .btn_filter');
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
    // 메인 페이지는 path가 빈 문자열 또는 '/'로 간주
    const isMainPage = host === mainPageUrl && (path === "" || path === "/");
    if (isMainPage) {
        NativeApp.finishApp();
    } else {
        history.back();
    }
  }
})();
// =======================================================
// =======================================================
// =======================================================







// =======================================================
// 6. 기타(디버그 및 버그 수정)
// =======================================================
(function() {
  //로깅 함수
  window.customLog = function(message) {
    console.log(message);
    if (typeof NativeApp !== "undefined" && typeof NativeApp[fn] === "function") {
      NativeApp.jsLog(message);
    }
  }

  //크롬캐스트에서 드롭다운 동작 안하는 문제 수정
  document.querySelectorAll('.filter_layer a').forEach(a => {
      a.setAttribute('tabindex', '0');
  });
  document.addEventListener('keydown', (e) => {
      const active = document.activeElement;

      if (active.classList.contains('btn_filter')) {
          const layer = active.nextElementSibling; // .filter_layer
          if (!layer) return;

          //드롭다운이 열려있을때, 카테고리 필터 버튼 포커스 상태에서는 아래 방향키만 동작하게 만들기
          if (e.key === 'ArrowLeft' || e.key == 'ArrowRight' || e.key === 'ArrowUp') {

            const computed = window.getComputedStyle(layer);
            const hasActiveClass = layer.classList && layer.classList.contains('active');
            const displayVisible = (layer.style.display && layer.style.display !== 'none') || (computed.display && computed.display !== 'none');
            const visibilityVisible = (layer.style.visibility && layer.style.visibility !== 'hidden') || (computed.visibility && computed.visibility !== 'hidden');
            const offscreen = layer.style.left && (layer.style.left === '-9999px' || layer.style.left.indexOf('-') === 0);
            const isOpen = hasActiveClass || (displayVisible && visibilityVisible && !offscreen);
            if (isOpen) {
              e.preventDefault();
            }
          }

          //드롭다운이 열려있을때, 카테고리 필터 버튼 포커스 상태에서 아래 방향키를 누르면 자식 요소로 이동하게 하기
          if (e.key === 'ArrowDown') {

            //드롭다운이 열려있을때
            const computed = window.getComputedStyle(layer);
            const hasActiveClass = layer.classList && layer.classList.contains('active');
            const displayVisible = (layer.style.display && layer.style.display !== 'none') || (computed.display && computed.display !== 'none');
            const visibilityVisible = (layer.style.visibility && layer.style.visibility !== 'hidden') || (computed.visibility && computed.visibility !== 'hidden');
            const offscreen = layer.style.left && (layer.style.left === '-9999px' || layer.style.left.indexOf('-') === 0);
            const isOpen = hasActiveClass || (displayVisible && visibilityVisible && !offscreen);
            if (isOpen) {
              const first = layer.querySelector('a');
              first?.focus();
              e.preventDefault();
            }
          }

      //드롭다운이 열려있고, 자식 요소들에 포커스가 있을 때
      } else if (active.closest('.filter_layer, .filter2_layer')) {

          //옆 방향키는 동작하지 않게 하기
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
          } else if (e.key === 'ArrowDown') {
              const next = active.nextElementSibling;
              if (next) next.focus();
              e.preventDefault();
          } else if (e.key === 'ArrowUp') {
              const prev = active.previousElementSibling;
              if (prev) prev.focus();
              e.preventDefault();
          }
      }
  });


  //검색 버튼 누르면 입력창으로 포커스 강제 이동
  const searchButtonQuery = document.querySelector('.btn_search')
  if (searchButtonQuery !== null) {
      document.querySelector('.btn_search').addEventListener('click', function (e) {
    e.preventDefault();
    const input = document.getElementById('sch_stx');

    // 입력창 표시 (숨겨져 있다면)
    input.style.display = 'block';

    // 짧은 딜레이 후 포커스
    setTimeout(() => {
        input.focus();
        input.click();  // 모바일에서 키보드 강제 호출에 필요함
    }, 50);
  });
  document.forms["fsearchbox"].addEventListener("submit", function (e) {
    const input = document.getElementById("sch_stx");

    if (!input.value.trim()) {
        e.preventDefault();// action 실행 막기
        input.focus();// 포커스 다시 주기 (선택)
    }
  });

  }



})();
// =======================================================
// =======================================================
// =======================================================






// =======================================================
// 7. PIP 지원============================================
// =======================================================
window.ApplyVideoPipStyle = function() {
    const movDiv = document.querySelector('.bo_v_mov');
    if (!movDiv) return;

    // 브라우저 전체 화면처럼 fixed
    movDiv.style.position = 'fixed';
    movDiv.style.top = '0';
    movDiv.style.left = '0';
    movDiv.style.width = '100vw';
    movDiv.style.setProperty('height', '100vh', 'important');
    movDiv.style.setProperty('display', 'block', 'important');
    movDiv.style.zIndex = '9999';
    movDiv.style.backgroundColor = 'black';

    // 중앙 정렬: flex 컨테이너
    //movDiv.style.display = 'flex';

    movDiv.style.alignItems = 'center';
    movDiv.style.justifyContent = 'center';

    // iframe 크기 지정: 부모 div에 맞게
    const iframe = movDiv.querySelector('view_iframe');
    if (iframe) {
        iframe.style.maxWidth = '100%';
        iframe.style.maxHeight = '100%';
        iframe.style.border = 'none';
    }

    // 페이지 스크롤 제거
    //document.body.style.overflow = 'hidden';
};
window.ApplyVideoNormalStyle = function() {
    const movDiv = document.querySelector('.bo_v_mov');
    if (!movDiv) return;
    movDiv.style.setProperty('height', '0px', 'important');
    movDiv.style.setProperty('display', 'flex', 'important');
};
window.ApplyVideoMobileStyle = function() {
    const movDiv = document.querySelector('.bo_v_mov');
    if (!movDiv) return;

    // 브라우저 전체 화면처럼 fixed
    movDiv.style.position = 'fixed';
    movDiv.style.top = '0';
    movDiv.style.left = '0';
    movDiv.style.width = '100vw';
    movDiv.style.setProperty('height', '100vh', 'important');
    movDiv.style.setProperty('display', 'block', 'important');
    //movDiv.style.zIndex = '9999';
    movDiv.style.backgroundColor = 'black';

    // 중앙 정렬: flex 컨테이너
    //movDiv.style.display = 'flex';

    movDiv.style.alignItems = 'center';
    movDiv.style.justifyContent = 'center';

    // iframe 크기 지정: 부모 div에 맞게
    const iframe = movDiv.querySelector('view_iframe');
    if (iframe) {
        iframe.style.maxWidth = '100%';
        iframe.style.maxHeight = '100%';
        iframe.style.border = 'none';
    }

    // 페이지 스크롤 제거
    //document.body.style.overflow = 'hidden';
};
//ApplyVideoNormalStyle();

if (isRunningOnTv) {
  ApplyVideoNormalStyle();
} else {
  //ApplyVideoPipStyle();
  ApplyVideoMobileStyle();
}

// =======================================================
// =======================================================
// =======================================================






customLog("[kotlin]유저스크립트 version: " + scriptVersion);
