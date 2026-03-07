import { defineConfig } from "tsup";
import { cp } from "fs/promises";
import path from "path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node18",
  clean: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // node-pty uses native bindings, must be external
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
