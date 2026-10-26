import assert from "node:assert";
import http from "node:http";

async function testPWA() {
  console.log("Starting Digibahas server for Mobile PWA validation...");

  const env = { ...process.env, PORT: "3456", JWT_SECRET: "test-secret-key-123456" };
  const { spawn } = await import("node:child_process");

  const serverProcess = spawn("node", ["server.js"], {
    env,
    stdio: ["pipe", "pipe", "pipe"]
  });

  // Wait for server to listen
  await new Promise((resolve) => setTimeout(resolve, 2000));

  function get(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:3456${path}`, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }).on("error", reject);
    });
  }

  try {
    // Test 1: Root /
    console.log("Checking GET / ...");
    const resRoot = await get("/");
    assert.strictEqual(resRoot.statusCode, 200);
    const htmlText = resRoot.body.toString("utf8");
    assert.ok(htmlText.includes('/manifest.webmanifest'), "Missing manifest link in HTML");
    assert.ok(htmlText.includes('pwaInstallBtn'), "Missing pwaInstallBtn in HTML");
    assert.ok(htmlText.includes('offlineBanner'), "Missing offlineBanner in HTML");
    assert.ok(htmlText.includes('/sw.js'), "Missing service worker registration in HTML");
    assert.ok(htmlText.includes('id="bottomNav"'), "Missing Mobile Bottom Navigation in HTML");
    assert.ok(htmlText.includes('id="mobileInstallBanner"'), "Missing Mobile Install Banner in HTML");
    assert.ok(htmlText.includes('viewport-fit=cover'), "Missing mobile viewport-fit=cover in HTML");
    console.log("✔ Root HTML has Mobile PWA UI elements, bottom navigation, and viewport settings");

    // Test 2: manifest.webmanifest
    console.log("Checking GET /manifest.webmanifest ...");
    const resManifest = await get("/manifest.webmanifest");
    assert.strictEqual(resManifest.statusCode, 200);
    assert.ok(
      resManifest.headers["content-type"]?.includes("application/manifest+json") ||
      resManifest.headers["content-type"]?.includes("application/json"),
      `Unexpected content-type: ${resManifest.headers["content-type"]}`
    );
    const manifestJson = JSON.parse(resManifest.body.toString("utf8"));
    assert.strictEqual(manifestJson.name, "DIGIBAHAS — Gerakan Bijak Berbahasa");
    assert.strictEqual(manifestJson.display, "standalone");
    assert.strictEqual(manifestJson.orientation, "portrait-primary");
    assert.ok(manifestJson.icons.length >= 3, "Manifest must have at least 3 icons");
    console.log("✔ Web App Manifest is valid for mobile PWA standalone experience");

    // Test 3: manifest.json alias
    console.log("Checking GET /manifest.json ...");
    const resManifestJson = await get("/manifest.json");
    assert.strictEqual(resManifestJson.statusCode, 200);
    const jsonParsed = JSON.parse(resManifestJson.body.toString("utf8"));
    assert.strictEqual(jsonParsed.short_name, "Digibahas");
    console.log("✔ manifest.json alias is valid");

    // Test 4: sw.js
    console.log("Checking GET /sw.js ...");
    const resSW = await get("/sw.js");
    assert.strictEqual(resSW.statusCode, 200);
    assert.strictEqual(resSW.headers["service-worker-allowed"], "/");
    assert.ok(resSW.headers["cache-control"]?.includes("no-cache"));
    const swCode = resSW.body.toString("utf8");
    assert.ok(swCode.includes("addEventListener('install'"), "Missing install listener in SW");
    assert.ok(swCode.includes("addEventListener('fetch'"), "Missing fetch listener in SW");
    console.log("✔ Service Worker served with correct headers and scope");

    // Test 5: offline.html
    console.log("Checking GET /offline.html ...");
    const resOffline = await get("/offline.html");
    assert.strictEqual(resOffline.statusCode, 200);
    assert.ok(resOffline.body.toString("utf8").includes("DIGIBAHAS"));
    console.log("✔ Offline fallback page is present and valid");

    // Test 6: Icons PNG validity
    const iconFiles = [
      { path: "/icons/icon-192.png", size: 192 },
      { path: "/icons/icon-512.png", size: 512 },
      { path: "/icons/icon-maskable-512.png", size: 512 }
    ];

    for (const icon of iconFiles) {
      console.log(`Checking GET ${icon.path} ...`);
      const resIcon = await get(icon.path);
      assert.strictEqual(resIcon.statusCode, 200);
      const buf = resIcon.body;
      assert.strictEqual(buf[0], 0x89);
      assert.strictEqual(buf[1], 0x50);
      assert.strictEqual(buf[2], 0x4e);
      assert.strictEqual(buf[3], 0x47);
      assert.strictEqual(buf[4], 0x0d);
      assert.strictEqual(buf[5], 0x0a);
      assert.strictEqual(buf[6], 0x1a);
      assert.strictEqual(buf[7], 0x0a);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      assert.strictEqual(w, icon.size);
      assert.strictEqual(h, icon.size);
      console.log(`✔ ${icon.path} is a valid ${w}x${h} PNG`);
    }

    // Test 7: SVG Icon
    console.log("Checking GET /icons/icon.svg ...");
    const resSvg = await get("/icons/icon.svg");
    assert.strictEqual(resSvg.statusCode, 200);
    assert.ok(resSvg.body.toString("utf8").includes("<svg"));
    console.log("✔ SVG icon is served correctly");

    console.log("\n========================================");
    console.log("ALL MOBILE PWA TESTS PASSED SUCCESSFULLY!");
    console.log("========================================\n");
  } finally {
    serverProcess.kill();
  }
}

testPWA().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
