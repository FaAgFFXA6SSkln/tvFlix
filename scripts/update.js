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
      });

      // 리디렉션이면 skip
      if (res.status >= 300 && res.status < 400) {
        console.log(`${url} redirected`);
        continue;
      }

      if (res.status === 200) {
        const text = await res.text();

        // 최소한의 정상 HTML 체크
        if (text.includes("<html")) {
          console.log(`✅ FOUND: ${url}`);
          return url;
        }
      }
    } catch (e) {
      console.log(`${url} error`);
    }
  }

  throw new Error("No valid URL found");
}

async function main() {
  const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

  const match = json.streamingHomeUrl.match(/tvwiki(\d+)/);
  const current = match ? parseInt(match[1], 10) : 17;

  const newUrl = await findWorkingUrl(current);

  if (newUrl !== json.streamingHomeUrl) {
    json.streamingHomeUrl = newUrl;

    fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2));
    console.log("✅ JSON updated");
  } else {
    console.log("No change");
  }
}

main();
