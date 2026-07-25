const fs = require("fs");

const JSON_PATH = "./main.json";

// URL에 포함된 tvwiki 뒤의 숫자 추출 (없으면 null)
function extractNumber(url) {
  const match = url.match(/tvwiki(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

async function getLatestUrl() {
  const res = await fetch("https://t.me/s/tvwiki_url", {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const text = await res.text();

  // tvwiki가 포함되고 뒤에 '.'이 있는 URL 검색
  const match = text.match(/https:\/\/[^\s"'<>]*tvwiki[^\s"'<>]*\.[^\s"'<>]*/i);

  if (match) {
    console.log("FOUND:", match[0]);
    return match[0];
  }

  console.log("No URL found in page");
  return null;
}

(async () => {
  try {
    console.log("START");

    const raw = fs.readFileSync(JSON_PATH, "utf-8");
    const json = JSON.parse(raw);

    const newUrl = await getLatestUrl();

    if (!newUrl) {
      console.log("SKIP: no url");
      return;
    }

    const oldUrl = json.streamingHomeUrl || "";

    const oldNum = extractNumber(oldUrl);
    const newNum = extractNumber(newUrl);

    // 둘 다 숫자가 있는 경우에만 번호 비교
    if (
      oldNum !== null &&
      newNum !== null &&
      newNum <= oldNum
    ) {
      console.log(
        `SKIP: old=${oldNum}, new=${newNum} (new is not greater)`
      );
      return;
    }

    if (newUrl !== oldUrl) {
      json.streamingHomeUrl = newUrl;
      fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2));
      console.log("UPDATED:", newUrl);
    } else {
      console.log("NO CHANGE");
    }

  } catch (err) {
    console.log("ERROR:", err.message);
  }
})();
