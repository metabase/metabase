import { Glob, $ } from "bun";
import { rename, readFile, appendFile, stat } from "node:fs/promises";

const FAILURES_FILE = "ts-convert-failures.txt";

// Track current file being processed for cleanup on cancel
let currentFile: { original: string; renamed: string } | null = null;

async function cleanup() {
  if (currentFile) {
    console.log(
      `\n[${timestamp()}] Interrupted! Reverting ${currentFile.renamed} -> ${currentFile.original}`,
    );
    try {
      // Check if the renamed file exists before trying to revert
      await stat(currentFile.renamed);
      await rename(currentFile.renamed, currentFile.original);
      console.log(`[${timestamp()}] Successfully reverted`);
    } catch {
      console.log(`[${timestamp()}] File already reverted or not found`);
    }
  }
  process.exit(1);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

async function loadFailures(): Promise<Set<string>> {
  try {
    const content = await readFile(FAILURES_FILE, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());
    return new Set(lines);
  } catch {
    return new Set();
  }
}

async function appendFailure(file: string): Promise<void> {
  await appendFile(FAILURES_FILE, file + "\n");
}

// Files to exclude (from tsconfig.json)
const EXCLUDED_FILES = new Set([
  "frontend/src/metabase/app-main.js",
  "frontend/src/metabase/app-public.js",
  "frontend/src/metabase/app-embed.js",
]);

async function getJsFiles(): Promise<string[]> {
  // Patterns matching tsconfig.json include paths
  const patterns = [
    "frontend/src/**/*.js",
    "frontend/src/**/*.jsx",
    "frontend/test/**/*.js",
    "frontend/test/**/*.jsx",
    "enterprise/frontend/src/**/*.js",
    "enterprise/frontend/src/**/*.jsx",
    "enterprise/frontend/test/**/*.js",
    "enterprise/frontend/test/**/*.jsx",
  ];

  const files: string[] = [];

  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan(".")) {
      if (!EXCLUDED_FILES.has(file)) {
        files.push(file);
      }
    }
  }

  return files;
}

function getTsExtension(file: string): string {
  if (file.endsWith(".jsx")) {
    return file.replace(/\.jsx$/, ".tsx");
  }
  return file.replace(/\.js$/, ".ts");
}

async function typeCheck(): Promise<boolean> {
  try {
    await $`yarn type-check-pure`.quiet();
    return true;
  } catch {
    return false;
  }
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

async function main() {
  const startTime = Date.now();

  console.log(`[${timestamp()}] Running initial type check...`);
  const initialCheck = await typeCheck();
  if (!initialCheck) {
    console.log(
      `[${timestamp()}] Initial type check failed. Please fix type errors before running this script.`,
    );
    process.exit(1);
  }
  console.log(`[${timestamp()}] Initial type check passed.\n`);

  console.log(`[${timestamp()}] Loading previous failures...`);
  const previousFailures = await loadFailures();
  if (previousFailures.size > 0) {
    console.log(
      `[${timestamp()}] Found ${previousFailures.size} previously failed files to skip`,
    );
  }

  console.log(`[${timestamp()}] Scanning for JS/JSX files...`);
  const allFiles = await getJsFiles();
  const files = allFiles.filter((f) => !previousFailures.has(f));
  console.log(
    `[${timestamp()}] Found ${files.length} files to process (${allFiles.length - files.length} skipped)\n`,
  );

  // Resume note: The glob only finds existing .js/.jsx files,
  // so previously converted files are automatically skipped on resume.
  // Previously failed files are tracked in ts-convert-failures.txt and skipped.

  const converted: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const tsFile = getTsExtension(file);
    const progress = `[${i + 1}/${files.length}]`;
    const elapsed = formatDuration(Date.now() - startTime);

    console.log(
      `[${timestamp()}] ${progress} Processing: ${file} (elapsed: ${elapsed})`,
    );

    // Track current file for cleanup on cancel
    currentFile = { original: file, renamed: tsFile };

    // Rename to TypeScript extension
    await rename(file, tsFile);

    // Run type check
    const success = await typeCheck();

    if (success) {
      converted.push(file);
      console.log(
        `  ✓ Passed (converted: ${converted.length}, failed: ${failed.length})\n`,
      );
    } else {
      // Revert the rename
      await rename(tsFile, file);
      failed.push(file);
      await appendFailure(file);
      console.log(
        `  ✗ Failed, reverted (converted: ${converted.length}, failed: ${failed.length})\n`,
      );
    }

    // Clear current file after processing
    currentFile = null;
  }

  const totalTime = formatDuration(Date.now() - startTime);

  console.log("\n========== Summary ==========");
  console.log(`Total time: ${totalTime}`);
  console.log(`Converted: ${converted.length}`);
  console.log(`Failed: ${failed.length}`);

  if (converted.length > 0) {
    console.log("\nConverted files:");
    converted.forEach((f) => console.log(`  ${f}`));
  }

  if (failed.length > 0) {
    console.log("\nFailed files:");
    failed.forEach((f) => console.log(`  ${f}`));
  }
}

main();
