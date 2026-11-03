/**
 * Pack a Chrome Web Store zip from the extension root (no node_modules / tests).
 *
 * The root manifest.json targets Firefox (background.scripts event page) so AMO
 * validation stays warning-free. This script derives the Chrome manifest:
 *   - background.service_worker instead of background.scripts
 *   - minimum_chrome_version
 *   - no browser_specific_settings (gecko-only keys)
 * It also writes an unpacked copy to dist/chrome for "Load unpacked".
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
  cpSync,
  writeFileSync
} from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = join(root, "web-ext-artifacts");
const distDir = join(root, "dist", "chrome");
const manifest = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(join(root, "manifest.json"), "utf8")
  )
);
const version = manifest.version || "0.0.0";
const outFile = join(outDir, `responsive_cache_cleaner-chrome-${version}.zip`);

export function toChromeManifest(src) {
  const out = structuredClone(src);
  const bg = out.background || {};
  const entry =
    bg.service_worker ||
    (Array.isArray(bg.scripts) && bg.scripts.length === 1 ? bg.scripts[0] : null);
  if (!entry) {
    throw new Error("Chrome manifest needs exactly one background script to become a service worker");
  }
  out.background = { service_worker: entry };
  if (bg.type) out.background.type = bg.type;
  delete out.browser_specific_settings;
  if (!out.minimum_chrome_version) out.minimum_chrome_version = "109";
  return out;
}

const IGNORE_DIRS = new Set([
  "node_modules",
  "test",
  "web-ext-artifacts",
  "scripts",
  "dist",
  ".git",
  ".cursor"
]);
const IGNORE_FILES = new Set([
  "package.json",
  "package-lock.json",
  ".gitignore",
  ".npmrc"
]);

function shouldSkip(absPath, relPosix) {
  const parts = relPosix.split("/");
  if (parts.some((p) => IGNORE_DIRS.has(p))) return true;
  if (IGNORE_FILES.has(parts[parts.length - 1])) return true;
  if (relPosix.endsWith(".zip")) return true;
  // Keep README + LICENSE; skip other markdown if any.
  if (relPosix.endsWith(".md") && relPosix !== "README.md") return true;
  return false;
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = relative(root, abs).split(sep).join("/");
    if (shouldSkip(abs, rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, files);
    else files.push({ abs, rel });
  }
  return files;
}

async function loadArchiver() {
  try {
    return require("archiver");
  } catch {
    // Install archiver ephemerally via npx is awkward; use built-in PowerShell on Windows
    // or Node zlib + manual zip. Prefer a zero-dep zip via child_process.
    return null;
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);

if (isMain) {
  mkdirSync(outDir, { recursive: true });
  const files = walk(root);
  const chromeManifest = JSON.stringify(toChromeManifest(manifest), null, 2) + "\n";

  // Stage an unpacked Chrome build (also what "Load unpacked" should point at).
  if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
  for (const f of files) {
    const dest = join(distDir, f.rel);
    mkdirSync(join(dest, ".."), { recursive: true });
    if (f.rel === "manifest.json") writeFileSync(dest, chromeManifest, "utf8");
    else cpSync(f.abs, dest);
  }

  const archiver = await loadArchiver();
  if (archiver) {
    await new Promise((resolve, reject) => {
      const output = createWriteStream(outFile);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(distDir, false);
      archive.finalize();
    });
  } else {
    // Zero-dep fallback: zip the staged dist folder with PowerShell Compress-Archive.
    const { spawnSync } = await import("node:child_process");
    const { renameSync } = await import("node:fs");
    // Compress to a temp zip first so a failed Compress-Archive cannot wipe the prior package.
    const tmpZip = `${outFile}.tmp.zip`;
    if (existsSync(tmpZip)) rmSync(tmpZip, { force: true });
    const ps = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$ErrorActionPreference='Stop'; $src=Get-ChildItem -LiteralPath '${distDir}' -Force; if(-not $src){ throw 'staging empty' }; Compress-Archive -Path $src.FullName -DestinationPath '${tmpZip}' -Force`
      ],
      { encoding: "utf8" }
    );
    if (ps.status !== 0) {
      console.error(ps.stdout, ps.stderr);
      process.exit(ps.status || 1);
    }
    if (existsSync(outFile)) rmSync(outFile, { force: true });
    renameSync(tmpZip, outFile);
  }

  console.log(`Wrote ${outFile} (${files.length} files); unpacked copy in ${distDir}`);
}
