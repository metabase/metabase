/* eslint-disable no-console -- build script */
import { spawnSync } from "child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";

const packageDir = resolve(import.meta.dirname, "..");
const USAGE =
  "Usage: bun run smoke-ui-package -- [--no-browser | --release-only] [--with-deps] [--keep]";
const FLAGS = ["--keep", "--release-only", "--no-browser", "--with-deps"];
const args = process.argv.slice(2);
const unknown = args.filter((arg) => !FLAGS.includes(arg));
const keep = args.includes("--keep");
const releaseOnly = args.includes("--release-only");
const skipBrowser = args.includes("--no-browser");
const withDeps = args.includes("--with-deps");
if (unknown.length > 0 || (releaseOnly && skipBrowser)) {
  console.error(
    unknown.length > 0
      ? `Unknown argument: ${unknown.join(" ")}`
      : "--no-browser and --release-only cannot be combined",
  );
  console.error(USAGE);
  process.exit(1);
}

function run(cmd: string, args: string[], cwd: string, quiet = false) {
  console.log(`\n$ ${cmd} ${args.join(" ")}  (${cwd})`);
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 1 << 28,
  });
  if (result.error) {
    console.error(`Could not run ${cmd}: ${result.error.message}`);
    return { ok: false };
  }
  const output = `${result.stdout}${result.stderr}`;
  if (!quiet || result.status !== 0) {
    process.stdout.write(output);
  }
  return { ok: result.status === 0 };
}

function must(cmd: string, args: string[], cwd: string, quiet = false) {
  const result = run(cmd, args, cwd, quiet);
  if (!result.ok) {
    throw new Error(`${cmd} ${args.join(" ")} failed`);
  }
  return result;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

must("bun", ["run", "pack"], packageDir);
must("bun", ["run", "check:package-versions"], packageDir);
must("bun", ["run", "check:dist"], packageDir);

const packDir = join(packageDir, ".pack");
const tarballs = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
assert(tarballs.length === 1, `expected one tarball, got ${tarballs}`);
const tarball = join(packDir, tarballs[0]);

// Outside the repo, so nothing resolves through the monorepo's node_modules or aliases.
const appDir = mkdtempSync(join(tmpdir(), "metabase-ui-smoke-"));
cpSync(join(packageDir, "smoke-app"), appDir, {
  recursive: true,
  filter: (src) =>
    !/\/(node_modules|dist|test-results|playwright-report)$/.test(src),
});

try {
  must(
    "bun",
    ["install", "--frozen-lockfile", "--linker=hoisted"],
    appDir,
    true,
  );
  must("bun", ["add", "--no-save", "--linker=hoisted", tarball], appDir);

  // With the hoisted linker, extra React copies appear under nested node_modules.
  const dependencies = readdirSync(join(appDir, "node_modules"), {
    recursive: true,
    withFileTypes: true,
  });
  for (const name of ["react", "react-dom"]) {
    const paths = dependencies
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name === name &&
          basename(entry.parentPath) === "node_modules",
      )
      .map((entry) => join(entry.parentPath, entry.name));
    assert(paths.length === 1, `expected one ${name}, got ${paths}`);
  }

  must("bun", ["run", "type-check"], appDir);
  must("bun", ["run", "build"], appDir);

  if (!skipBrowser) {
    must(
      "bun",
      [
        "run",
        "playwright",
        "install",
        ...(withDeps ? ["--with-deps"] : []),
        "chromium",
      ],
      appDir,
    );
    must("bun", ["run", releaseOnly ? "test:release" : "test"], appDir);
  }

  const assets = readdirSync(join(appDir, "dist/assets"));
  for (const weight of ["regular", "700", "900"]) {
    assert(
      assets.some(
        (f) => f.startsWith(`lato-v16-latin-${weight}`) && f.endsWith(".woff2"),
      ),
      `built output is missing Lato ${weight} .woff2`,
    );
  }
  assert(
    existsSync(
      join(appDir, "node_modules/@metabase/ui/dist/fonts/Lato/OFL.txt"),
    ),
    "installed package is missing fonts/Lato/OFL.txt",
  );

  console.log("\nSmoke test passed.");
  console.log(`Tarball:  ${tarball}`);
} catch (error) {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  console.log(`Temp dir: ${appDir}`);
  if (keep) {
    console.log("Kept the temp dir.");
  } else {
    rmSync(appDir, { recursive: true, force: true });
    console.log("Removed the temp dir (pass --keep to leave it in place).");
  }
}
