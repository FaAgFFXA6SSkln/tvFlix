const fs = require("fs");

const JSON_PATH = "./main.json";

function extractNumber(url) {
  const match = url.match(/tvwiki(\d+)\.net/);
  return match ? parseInt(match[1], 10) : null;
}

async function getLatestUrl() {
  const res = await fetch("https://telegra.ph/%ED%9B%84%ED%9B%84%ED%8B%B0%EB%B9%84-%EC%B5%9C%EC%8B%A0-%EC%A3%BC%EC%86%8C-09-03", {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const text = await res.text();

  const match = text.match(/hoohootv/);

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

    const oldUrl = json.streamingHomeUrl;

    const oldNum = extractNumber(oldUrl);
    const newNum = extractNumber(newUrl);

    if (oldNum !== null && newNum !== null && newNum <= oldNum) {
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
