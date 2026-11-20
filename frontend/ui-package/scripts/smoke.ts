/* eslint-disable no-console -- build script */
import { spawnSync } from "child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const packageDir = resolve(import.meta.dirname, "..");
const USAGE =
  "Usage: bun run smoke-ui-package -- [--no-browser | --release-only] [--keep]";
const FLAGS = ["--keep", "--release-only", "--no-browser"];
const args = process.argv.slice(2);
const unknown = args.filter((arg) => !FLAGS.includes(arg));
const keep = args.includes("--keep");
const releaseOnly = args.includes("--release-only");
const skipBrowser = args.includes("--no-browser");
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
    return { ok: false, output: "", stdout: "" };
  }
  const output = `${result.stdout}${result.stderr}`;
  if (!quiet || result.status !== 0) {
    process.stdout.write(output);
  }
  return { ok: result.status === 0, output, stdout: result.stdout };
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
  must("npm", ["ci", "--no-audit", "--no-fund"], appDir, true);
  // No --force or --legacy-peer-deps: kbar's peer warnings are expected, errors are not.
  const install = must(
    "npm",
    ["install", "--no-save", "--no-audit", "--no-fund", tarball],
    appDir,
  );
  const peerWarnings = install.output
    .split("\n")
    .filter((line) => /^npm warn.*(peer|ERESOLVE)/i.test(line));
  console.log(
    `\nnpm peer warnings seen (expected from kbar): ${peerWarnings.length}`,
  );

  const ls = run(
    "npm",
    ["ls", "react", "react-dom", "--all", "--parseable"],
    appDir,
    true,
  );
  for (const name of ["react", "react-dom"]) {
    const paths = new Set(
      ls.stdout.split("\n").filter((p) => p.endsWith(`/node_modules/${name}`)),
    );
    assert(paths.size === 1, `expected one ${name}, got ${[...paths]}`);
  }

  must("npm", ["run", "type-check"], appDir);
  must("npm", ["run", "build"], appDir);

  if (!skipBrowser) {
    must("npx", ["playwright", "install", "chromium"], appDir);
    must("npm", ["run", releaseOnly ? "test:release" : "test"], appDir);
  }

  const assets = readdirSync(join(appDir, "dist/assets"));
  for (const weight of ["regular", "700", "900"]) {
    for (const ext of ["woff2", "woff"]) {
      assert(
        assets.some(
          (f) =>
            f.startsWith(`lato-v16-latin-${weight}`) && f.endsWith(`.${ext}`),
        ),
        `built output is missing Lato ${weight} .${ext}`,
      );
    }
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
