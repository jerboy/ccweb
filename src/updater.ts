import https from "https";
import { execSync } from "child_process";

declare const __VERSION__: string;
const PKG_NAME = "ccwebtty";

function fetchLatestVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(`https://registry.npmjs.org/${PKG_NAME}/latest`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data).version);
          } catch {
            reject(new Error("Failed to parse registry response"));
          }
        });
      })
      .on("error", reject);
  });
}

export async function checkUpdate(): Promise<void> {
  try {
    const latest = await fetchLatestVersion();
    if (latest !== __VERSION__) {
      console.log(
        `\n  New version available: ${__VERSION__} -> \x1b[32m${latest}\x1b[0m`
      );
      console.log(`  Run \x1b[36mccweb update\x1b[0m to update\n`);
    }
  } catch {
    // silently ignore network errors
  }
}

export async function selfUpdate(): Promise<void> {
  try {
    const latest = await fetchLatestVersion();
    if (latest === __VERSION__) {
      console.log(`Already up to date (v${__VERSION__})`);
      return;
    }
    console.log(`Updating ${PKG_NAME}: ${__VERSION__} -> ${latest} ...`);
    execSync(`npm install -g ${PKG_NAME}@latest`, { stdio: "inherit" });
    console.log(`Successfully updated to v${latest}`);
  } catch (err: any) {
    console.error(`Update failed: ${err.message}`);
    process.exit(1);
  }
}
