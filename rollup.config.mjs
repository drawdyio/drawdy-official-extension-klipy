import typescript from "@rollup/plugin-typescript";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const VIRTUAL_ID = "virtual:klipy-env";
const RESOLVED_ID = "\0klipy-env";
const DEFAULT_API_BASE = "https://backend.drawdy.io";

// Precedence: real environment > .env.local > .env. loadEnvFile never
// overwrites a variable that is already set, so loading in this order is
// enough. Read once per process: editing .env needs a dev server restart.
for (const file of [".env.local", ".env"]) {
    const path = join(dir, file);
    if (existsSync(path)) process.loadEnvFile(path);
}

// Trailing slashes would double up in `${BUILD_API_BASE}/api/klipy/gifs`, and
// an empty value would make the request relative — the driver sandbox runs on
// an opaque origin, so a relative URL has nothing to resolve against.
const configuredApiBase = (process.env.DRAWDY_API_BASE ?? "")
    .trim()
    .replace(/\/+$/, "");
const API_BASE = configuredApiBase || DEFAULT_API_BASE;

if (API_BASE !== DEFAULT_API_BASE) {
    console.log(`[klipy-env] DRAWDY_API_BASE=${API_BASE}`);
}

// Inlines `.svg` imports as their markup, so icons live as real files under
// src/assets/ rather than as string literals in TypeScript.
const svgMarkup = () => ({
    name: "svg-markup",
    transform: (code, id) =>
        id.endsWith(".svg")
            ? { code: `export default ${JSON.stringify(code.trim())};`, map: null }
            : null,
});

const klipyEnv = () => ({
    name: "klipy-env",
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load: (id) =>
        id === RESOLVED_ID
            ? `export const BUILD_API_BASE = ${JSON.stringify(API_BASE)};`
            : null,
});

export default {
    input: join(dir, "src", "index.ts"),
    output: {
        file: join(dir, "dist", "main.js"),
        format: "cjs",
        exports: "named",
    },
    plugins: [
        klipyEnv(),
        svgMarkup(),
        typescript({ tsconfig: join(dir, "tsconfig.json") }),
    ],
};
