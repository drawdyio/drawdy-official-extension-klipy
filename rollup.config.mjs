import typescript from "@rollup/plugin-typescript";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const ENV_MODULE = join(dir, "src", "env.ts");
const DEFAULT_API_BASE = "https://backend.drawdy.io";

for (const file of [".env.local", ".env"]) {
  const path = join(dir, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const configuredApiBase = (process.env.DRAWDY_API_BASE ?? "")
  .trim()
  .replace(/\/+$/, "");
const API_BASE = configuredApiBase || DEFAULT_API_BASE;

if (API_BASE !== DEFAULT_API_BASE) {
  console.log(`[klipy-env] DRAWDY_API_BASE=${API_BASE}`);
}

const API_BASE_RE = /(export const BUILD_API_BASE = )"[^"]*"/;

const apiBaseOverride = () => ({
  name: "klipy-api-base",
  transform(code, id) {
    if (id !== ENV_MODULE || API_BASE === DEFAULT_API_BASE) return null;
    if (!API_BASE_RE.test(code)) {
      this.error(`could not find the BUILD_API_BASE literal in ${ENV_MODULE}`);
    }
    return {
      code: code.replace(API_BASE_RE, `$1${JSON.stringify(API_BASE)}`),
      map: null,
    };
  },
});

export default {
  input: join(dir, "src", "index.ts"),
  output: {
    file: join(dir, "dist", "main.js"),
    format: "cjs",
    exports: "named",
  },
  plugins: [
    apiBaseOverride(),
    typescript({ tsconfig: join(dir, "tsconfig.json") }),
  ],
};
