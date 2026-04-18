const fs = require("fs");
const fetch = require("node-fetch");

const JSON_PATH = "./main/main.json";

async function findWorkingUrl(start = 17, maxTry = 50) {
  for (let i = start; i < start + maxTry; i++) {
    const url = `https://tvwiki${i}.net`;

    try {
      const res = await fetch(url, {
        redirect: "manual",
        timeout: 5000,
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      });

      // 리디렉션 skip
      if (res.status >= 300 && res.status < 400) continue;

      // 핵심: 200이면 그냥 통과
      if (res.status === 200) {
        console.log(`✅ FOUND: ${url}`);
        return url;
      }

    } catch (e) {
      console.log(`${url} error`);
    }
  }

  // ❗ 여기서 throw 하면 workflow 실패됨
  return null;
}

async function main() {
  const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

  const match = json.streamingHomeUrl.match(/tvwiki(\d+)/);
  const current = match ? parseInt(match[1], 10) : 17;

  const newUrl = await findWorkingUrl(current);

  // ❗ 못 찾으면 그냥 종료 (실패 안 시킴)
  if (!newUrl) {
    console.log("No valid URL found (skip)");
    return;
  }

  if (newUrl !== json.streamingHomeUrl) {
    json.streamingHomeUrl = newUrl;
    fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2));
    console.log("✅ JSON updated");
  } else {
    console.log("No change");
  }
}

main();
