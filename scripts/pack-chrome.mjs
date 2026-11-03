/**
 * Pack a Chrome Web Store zip from the extension root (no node_modules / tests).
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = join(root, "web-ext-artifacts");
const manifest = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(join(root, "manifest.json"), "utf8")
  )
);
const version = manifest.version || "0.0.0";
const outFile = join(outDir, `responsive_cache_cleaner-chrome-${version}.zip`);

const IGNORE_DIRS = new Set([
  "node_modules",
  "test",
  "web-ext-artifacts",
  "scripts",
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
  if (relPosix.endsWith(".md") && relPosix !== "README.md" && relPosix !== "LICENSE") {
    // keep README + LICENSE; skip other markdown if any
  }
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

mkdirSync(outDir, { recursive: true });
const files = walk(root);
const archiver = await loadArchiver();

if (archiver) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(outFile);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    for (const f of files) archive.file(f.abs, { name: f.rel });
    archive.finalize();
  });
} else {
  // Zero-dep fallback: write a file list and zip with PowerShell Compress-Archive
  // after staging into a temp folder-free approach using tar isn't ideal on Windows.
  const { spawnSync } = await import("node:child_process");
  const staging = join(outDir, `_chrome_stage_${version}`);
  const { rmSync, cpSync, mkdirSync: mkdir } = await import("node:fs");
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  for (const f of files) {
    const dest = join(staging, f.rel);
    mkdir(join(dest, ".."), { recursive: true });
    cpSync(f.abs, dest);
  }
  if (existsSync(outFile)) rmSync(outFile, { force: true });
  const ps = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path (Join-Path '${staging}' '*') -DestinationPath '${outFile}' -Force`
    ],
    { encoding: "utf8" }
  );
  if (ps.status !== 0) {
    console.error(ps.stdout, ps.stderr);
    process.exit(ps.status || 1);
  }
  rmSync(staging, { recursive: true, force: true });
}

console.log(`Wrote ${outFile} (${files.length} files)`);
