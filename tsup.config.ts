import { defineConfig } from "tsup";
import { readFileSync } from "fs";
import { cp } from "fs/promises";
import path from "path";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node18",
  clean: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  external: ["node-pty"],
  async onSuccess() {
    await cp(
      path.join("src", "public"),
      path.join("dist", "public"),
      { recursive: true }
    );
    console.log("Copied public/ to dist/public/");
  },
});
