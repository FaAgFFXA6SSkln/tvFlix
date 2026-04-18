const fs = require("fs");

const JSON_PATH = "./main.json";

// 🔍 실제 정상 페이지인지 판단
function isValidContent(text) {
  if (!text) return false;

  // 너무 짧으면 실패
  if (text.length < 1000) return false;

  // Cloudflare / 차단 페이지 필터
  if (text.includes("Just a moment")) return false;
  if (text.includes("Attention Required")) return false;
  if (text.includes("Cloudflare")) return false;

  return true;
}

async function findWorkingUrl(start = 0, maxTry = 50) {
  for (let i = start; i < start + maxTry; i++) {
    const url = `https://tvwiki${i}.net`;

    try {
      console.log("🔎 try:", url);

      const res = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/html"
        }
      });

      // 🔁 리디렉션 처리
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        console.log("↪ redirect:", url, "→", location);

        // 다른 도메인으로 튀면 실패
        if (location && !location.includes(`tvwiki${i}`)) {
          continue;
        }
      }

      // ✅ 200 응답일 때만 내용 확인
      if (res.status === 200) {
        const text = await res.text();

        if (isValidContent(text)) {
          console.log("✅ FOUND:", url);
          return url;
        } else {
          console.log("⚠️ invalid content:", url);
        }
      } else {
        console.log("status:", res.status, url);
      }

    } catch (e) {
      console.log("❌ error:", url, e.message);
    }
  }

  return null;
}

(async () => {
  try {
    console.log("🚀 START");

    const raw = fs.readFileSync(JSON_PATH, "utf-8");
    const json = JSON.parse(raw);

    // 🔢 시작 번호 추출
    const match = json.streamingHomeUrl?.match(/tvwiki(\d+)/);
    const current = match ? parseInt(match[1], 10) : 13;

    console.log("📌 start from:", current);

    const newUrl = await findWorkingUrl(current);

    if (!newUrl) {
      console.log("⛔ SKIP: no valid url found");
      return;
    }

    if (newUrl !== json.streamingHomeUrl) {
      json.streamingHomeUrl = newUrl;

      fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2));
      console.log("✅ UPDATED:", newUrl);
    } else {
      console.log("👌 NO CHANGE");
    }

  } catch (err) {
    console.log("💥 FATAL ERROR:", err.message);
  }
})();
