// Regenerates assets/klipy.svg from assets/klipy-logo.jpeg, and copies the
// result into manifest.json's "icon" field.
//
// The source logo is a large JPEG of the KLIPY mark padded out on a white
// square. For an 18x18 rail icon it needs the padding trimmed, the background
// turned into alpha (so it works in both themes) and the pixels shrunk down.
// sips is the only image tool available on a stock macOS, and it can't trim or
// key out a colour, so it is used purely to decode the JPEG into a BMP that
// this script can read pixel by pixel.
//
// The manifest carries the markup inline rather than a filename because the
// packer only puts manifest.json and main.js in the .drawdyx — a file
// reference would dangle. assets/klipy.svg stays the one source of truth: the
// manifest field is generated from it, never hand-edited.
//
// Run: npm run icon

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "assets", "klipy-logo.jpeg");
const OUT = join(root, "assets", "klipy.svg");
const MANIFEST = join(root, "manifest.json");

// Pixel size of the embedded bitmap. The icon renders at 18px, so 64px covers
// well past 3x displays.
const SIZE = 64;
// Rail icon geometry, matching what Drawdy renders the action button at.
const ICON_PX = 18;
const VIEWBOX = 24;
// Anything at or above this in every channel is background, not artwork.
const WHITE = 250;
// Padding kept around the trimmed mark, as a fraction of its longest side.
const BREATHING_ROOM = 0.08;
// Alpha at or above this counts as solid: keep the averaged colour as-is
// instead of un-compositing it, so flat brand colour stays exact.
const SOLID = 0.92;

const bmpPath = join(mkdtempSync(join(tmpdir(), "klipy-icon-")), "logo.bmp");
execFileSync("sips", ["-s", "format", "bmp", SOURCE, "--out", bmpPath], {
    stdio: "ignore",
});

// BMP as written by sips: bottom-up rows, BGR, each row padded to 4 bytes.
const bmp = readFileSync(bmpPath);
const dataOffset = bmp.readUInt32LE(10);
const width = bmp.readInt32LE(18);
const heightRaw = bmp.readInt32LE(22);
const bpp = bmp.readUInt16LE(28);
if (bpp !== 24 && bpp !== 32) throw new Error(`unsupported BMP depth: ${bpp}`);
const height = Math.abs(heightRaw);
const bottomUp = heightRaw > 0;
const bytesPerPx = bpp / 8;
const rowSize = Math.floor((bpp * width + 31) / 32) * 4;

function pixel(x, y) {
    // Outside the source counts as background, so edge boxes average correctly.
    if (x < 0 || y < 0 || x >= width || y >= height) return [255, 255, 255];
    const row = bottomUp ? height - 1 - y : y;
    const i = dataOffset + row * rowSize + x * bytesPerPx;
    return [bmp[i + 2], bmp[i + 1], bmp[i]];
}

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const [r, g, b] = pixel(x, y);
        if (Math.min(r, g, b) >= WHITE) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
}
if (maxX < 0) throw new Error("source image is blank");

// Square crop centred on the mark, so the aspect ratio survives the resize.
const side = Math.round(
    Math.max(maxX - minX + 1, maxY - minY + 1) * (1 + BREATHING_ROOM)
);
const left = (minX + maxX) / 2 - side / 2;
const top = (minY + maxY) / 2 - side / 2;

const step = side / SIZE;
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let oy = 0; oy < SIZE; oy++) {
    for (let ox = 0; ox < SIZE; ox++) {
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        const x0 = Math.floor(left + ox * step);
        const y0 = Math.floor(top + oy * step);
        const x1 = Math.max(Math.floor(left + (ox + 1) * step), x0 + 1);
        const y1 = Math.max(Math.floor(top + (oy + 1) * step), y0 + 1);
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const [r, g, b] = pixel(x, y);
                sr += r;
                sg += g;
                sb += b;
                n++;
            }
        }
        const r = sr / n;
        const g = sg / n;
        const b = sb / n;
        // The darkest channel of a saturated brand colour is ~0, so whatever
        // lightness is left over is white background showing through. Reading
        // that as alpha turns antialiased edges into soft transparency.
        const alpha = (255 - Math.min(r, g, b)) / 255;
        const o = (oy * SIZE + ox) * 4;
        if (alpha < 0.004) continue;
        const solid = alpha >= SOLID;
        const unmix = (c) =>
            Math.max(0, Math.min(255, Math.round((c - (1 - alpha) * 255) / alpha)));
        rgba[o] = solid ? Math.round(r) : unmix(r);
        rgba[o + 1] = solid ? Math.round(g) : unmix(g);
        rgba[o + 2] = solid ? Math.round(b) : unmix(b);
        rgba[o + 3] = solid ? 255 : Math.round(alpha * 255);
    }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function chunk(type, body) {
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    let c = 0xffffffff;
    for (const byte of typed) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, typed, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bits per channel
ihdr[9] = 6; // colour type: RGBA
const stride = SIZE * 4 + 1;
const scanlines = Buffer.alloc(SIZE * stride);
for (let y = 0; y < SIZE; y++) {
    scanlines[y * stride] = 0; // filter: none
    rgba.copy(scanlines, y * stride + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
]);

// Kept to a single line so the identical string can go into manifest.json
// without escaped newlines. It is almost entirely base64 either way.
const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}"` +
    ` width="${ICON_PX}" height="${ICON_PX}">` +
    `<image href="data:image/png;base64,${png.toString("base64")}"` +
    ` x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}" /></svg>`;
writeFileSync(OUT, `${markup}\n`);

// The rollup .svg loader trims what it reads, so the driver gets back exactly
// the string stored in the manifest.
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
manifest.icon = markup;
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
    `icon ${SIZE}x${SIZE} from ${width}x${height}, crop ${side}px -> assets/klipy.svg + manifest.json icon (${markup.length} bytes)`
);
