import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconsDir = path.join(__dirname, "..", "public", "icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// SVG Icon definition
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1B2A4D"/>
      <stop offset="100%" stop-color="#0B1A32"/>
    </linearGradient>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7FE9DD"/>
      <stop offset="50%" stop-color="#0E8C93"/>
      <stop offset="100%" stop-color="#0A6E74"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Background Squircle -->
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#bgGrad)"/>
  
  <!-- Outer glowing accent ring -->
  <rect x="24" y="24" width="464" height="464" rx="100" fill="none" stroke="#7FE9DD" stroke-width="4" stroke-opacity="0.25"/>

  <!-- Main Symbol: Stylized "D" with book + chat motif -->
  <g filter="url(#shadow)" transform="translate(4, -4)">
    <!-- Book Spine / Left Pillar of D -->
    <rect x="120" y="116" width="56" height="280" rx="20" fill="url(#brandGrad)"/>

    <!-- Upper arc of D / Speech curl -->
    <path d="M 160 116 
             H 270 
             C 360 116, 400 170, 400 256 
             C 400 342, 360 396, 270 396 
             H 160 
             Z" 
          fill="none" 
          stroke="url(#brandGrad)" 
          stroke-width="52" 
          stroke-linejoin="round"
          stroke-linecap="round"/>

    <!-- Quill / Sparkle / AI Accent inside D -->
    <circle cx="280" cy="256" r="32" fill="#7FE9DD"/>
    <path d="M 280 196 L 288 240 L 332 248 L 288 256 L 280 300 L 272 256 L 228 248 L 272 240 Z" fill="#FFFFFF"/>
    
    <!-- Accent line simulating book pages underneath -->
    <line x1="130" y1="360" x2="350" y2="360" stroke="#7FE9DD" stroke-width="6" stroke-linecap="round" opacity="0.6"/>
  </g>
</svg>`;

fs.writeFileSync(path.join(iconsDir, "icon.svg"), svgContent.trim());
console.log("Wrote icon.svg");

// Helper to encode RGBA buffer to PNG
function createPng(width, height, rgbaBuffer) {
  // CRC32 table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, "ascii");
    data.copy(buf, 8);
    const checkBuf = Buffer.alloc(4 + len);
    checkBuf.write(type, 0, 4, "ascii");
    data.copy(checkBuf, 4);
    buf.writeUInt32BE(crc32(checkBuf), 8 + len);
    return buf;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk("IHDR", ihdr);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let srcOffset = 0;
  let dstOffset = 0;
  for (let y = 0; y < height; y++) {
    scanlines[dstOffset++] = 0; // filter: None
    rgbaBuffer.copy(scanlines, dstOffset, srcOffset, srcOffset + width * 4);
    srcOffset += width * 4;
    dstOffset += width * 4;
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate pixel graphics for 192, 512, and maskable 512
function renderIcon(size, isMaskable = false) {
  const buf = Buffer.alloc(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;
  const rCorner = isMaskable ? 0 : size * 0.22;
  const margin = isMaskable ? 0 : size * 0.04;
  const boxMin = margin;
  const boxMax = size - margin;

  // Background colors: #1B2A4D -> #0B1A32
  const bgTop = [0x1b, 0x2a, 0x4d];
  const bgBot = [0x0b, 0x1a, 0x32];
  // Brand colors: #7FE9DD (mint), #0E8C93 (teal), #FFFFFF
  const mint = [0x7f, 0xe9, 0xdd];
  const teal = [0x0e, 0x8c, 0x93];
  const white = [0xff, 0xff, 0xff];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Check rounded rect containment if not maskable
      let inBox = true;
      if (!isMaskable) {
        if (x < boxMin || x > boxMax || y < boxMin || y > boxMax) {
          inBox = false;
        } else {
          // Check 4 corners
          const dx = Math.min(x - (boxMin + rCorner), (boxMax - rCorner) - x);
          const dy = Math.min(y - (boxMin + rCorner), (boxMax - rCorner) - y);
          if (dx < 0 && dy < 0) {
            if (dx * dx + dy * dy > rCorner * rCorner) {
              inBox = false;
            }
          }
        }
      }

      if (!inBox) {
        // Transparent
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      // Background gradient
      const t = y / size;
      let r = Math.round(bgTop[0] * (1 - t) + bgBot[0] * t);
      let g = Math.round(bgTop[1] * (1 - t) + bgBot[1] * t);
      let b = Math.round(bgTop[2] * (1 - t) + bgBot[2] * t);
      let a = 255;

      // Draw emblem geometry
      // Center icon scaling (safe zone for maskable is central 80%)
      const scale = isMaskable ? 0.72 : 0.88;
      const nx = (x - cx) / (cx * scale); // -1 to 1
      const ny = (y - cy) / (cy * scale); // -1 to 1

      // 1. Spine of D: nx in [-0.55, -0.32], ny in [-0.6, 0.6]
      const inSpine = (nx >= -0.55 && nx <= -0.32 && ny >= -0.6 && ny <= 0.6);

      // 2. Loop of D:
      // Outer arc: right from -0.32, centered around ny=0, radius ~ 0.6
      // Inner cut: radius ~ 0.38
      const dLoopX = nx - (-0.32);
      const dDist = Math.sqrt(dLoopX * dLoopX + (ny * 1.05) * (ny * 1.05));
      const inLoop = (nx >= -0.32 && dDist <= 0.62 && dDist >= 0.36 && Math.abs(ny) <= 0.62);

      // 3. Central sparkle / star:
      const sDistX = Math.abs(nx - 0.05);
      const sDistY = Math.abs(ny);
      const inStar = (sDistX + sDistY < 0.16) || (sDistX < 0.035 && sDistY < 0.22) || (sDistY < 0.035 && sDistX < 0.22);

      // 4. Little accent dot / ink circle:
      const dotDist = Math.hypot(nx - 0.05, ny);
      const inDot = dotDist < 0.07;

      if (inStar) {
        r = white[0]; g = white[1]; b = white[2];
      } else if (inDot) {
        r = mint[0]; g = mint[1]; b = mint[2];
      } else if (inSpine || inLoop) {
        // Gradient mint to teal
        const gt = (ny + 0.6) / 1.2;
        r = Math.round(mint[0] * (1 - gt) + teal[0] * gt);
        g = Math.round(mint[1] * (1 - gt) + teal[1] * gt);
        b = Math.round(mint[2] * (1 - gt) + teal[2] * gt);
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }

  return createPng(size, size, buf);
}

// Generate PNGs
const png192 = renderIcon(192, false);
fs.writeFileSync(path.join(iconsDir, "icon-192.png"), png192);
console.log("Wrote icon-192.png");

const png512 = renderIcon(512, false);
fs.writeFileSync(path.join(iconsDir, "icon-512.png"), png512);
console.log("Wrote icon-512.png");

const pngMaskable = renderIcon(512, true);
fs.writeFileSync(path.join(iconsDir, "icon-maskable-512.png"), pngMaskable);
console.log("Wrote icon-maskable-512.png");

console.log("All icons created successfully!");
