const fs = require("fs");

const JSON_PATH = "./main.json";

async function getLatestUrl() {
  const res = await fetch(
    "https://telegra.ph/%ED%9B%84%ED%9B%84%ED%8B%B0%EB%B9%84-%EC%B5%9C%EC%8B%A0-%EC%A3%BC%EC%86%8C-09-03",
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    }
  );

  const html = await res.text();

  // 모든 href 추출
  const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);

  // https:// 이고 hoohootv가 포함된 링크 찾기
  const url = hrefs.find(
    (href) =>
      href.startsWith("https://") &&
      href.toLowerCase().includes("hoohootv")
  );

  if (url) {
    console.log("FOUND:", url);
    return url;
  }

  console.log("No matching URL found");
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

    const oldUrl = json.streamingHomeUrl;

    // 기존 주소와 동일하면 업데이트하지 않음
    if (newUrl === oldUrl) {
      console.log("NO CHANGE");
      return;
    }

    json.streamingHomeUrl = newUrl;
    fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2));

    console.log("UPDATED:", newUrl);
  } catch (err) {
    console.error("ERROR:", err);
  }
})();
