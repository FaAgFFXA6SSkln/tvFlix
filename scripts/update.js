const fs = require("fs");

const JSON_PATH = "./main.json";

async function findWorkingUrl(start = 17, maxTry = 50) {
  for (let i = start; i < start + maxTry; i++) {
    const url = `https://tvwiki${i}.net`;

    try {
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      if (res.status >= 300 && res.status < 400) continue;

      if (res.status === 200) {
        console.log("FOUND:", url);
        return url;
      }
    } catch (e) {
      console.log("error:", url);
    }
  }
  return null;
}

(async () => {
  try {
    console.log("START");

    const raw = fs.readFileSync(JSON_PATH, "utf-8");
    const json = JSON.parse(raw);

    const match = json.streamingHomeUrl?.match(/tvwiki(\d+)/);
    const current = match ? parseInt(match[1], 10) : 17;

    const newUrl = await findWorkingUrl(current);

    if (!newUrl) {
      console.log("SKIP: no url");
      return;
    }

    if (newUrl !== json.streamingHomeUrl) {
      json.streamingHomeUrl = newUrl;
      fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2));
      console.log("UPDATED");
    } else {
      console.log("NO CHANGE");
    }

  } catch (err) {
    console.log("FATAL ERROR:", err.message);
    // ❗ 절대 throw 안 함
  }
})();
