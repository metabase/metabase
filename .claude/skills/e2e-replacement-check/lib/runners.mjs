import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_REPORTER = path.join(HERE, "reporters", "results-reporter.cjs");

export function runProcess(cmd, args, { cwd, env, timeoutMs, children, logFile }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    children?.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      children?.delete(child);
      if (logFile) {
        fs.appendFileSync(logFile, `\n$ ${cmd} ${args.join(" ")}\n${stdout}${stderr}`);
      }
      resolve({ code, stdout, stderr, timedOut, ms: Date.now() - started });
    });
  });
}

function jestBin(root) {
  const bin = path.join(root, "node_modules", "jest", "bin", "jest.js");
  if (!fs.existsSync(bin)) {
    throw new Error(`${bin} is missing; install the frontend dependencies first (bun install)`);
  }
  return bin;
}

export async function runJest({ root, specs, coverageFiles = [], resultsFile, timeoutMs = 10 * 60 * 1000, children, logFile }) {
  fs.rmSync(resultsFile, { force: true });
  const args = [
    jestBin(root),
    "--ci",
    "--silent",
    "--passWithNoTests",
    "--forceExit",
    "--ignoreProjects",
    "ci-scripts",
    "lint-rules",
    "--maxWorkers=50%",
    `--reporters=${RESULTS_REPORTER}`,
    ...(coverageFiles.length
      ? ["--coverage", "--coverageReporters=none", ...coverageFiles.map((f) => `--collectCoverageFrom=${f}`)]
      : []),
    "--runTestsByPath",
    ...specs,
  ];
  const r = await runProcess(process.execPath, args, {
    cwd: root,
    env: { REPLACEMENT_CHECK_RESULTS: resultsFile },
    timeoutMs,
    children,
    logFile,
  });
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  } catch {}
  const tests = new Map();
  const suiteErrors = new Map();
  const covered = new Map();
  for (const suite of raw?.suites ?? []) {
    const error = suite.exec_error ?? suite.failure_message;
    if (error && suite.tests.length === 0) {
      suiteErrors.set(suite.spec, error);
    }
    for (const t of suite.tests) {
      tests.set(`${suite.spec}::${t.full_name}`, { status: t.status, message: t.message });
    }
    covered.set(suite.spec, suite.covered);
  }
  return {
    ok: raw !== null,
    tests,
    suiteErrors,
    covered,
    statements: raw?.statements ?? {},
    ms: r.ms,
    timedOut: r.timedOut,
    stderrTail: (r.stderr || "").slice(-2000),
  };
}

export async function listRelatedSpecs({ root, file, children, logFile }) {
  const r = await runProcess(
    process.execPath,
    [jestBin(root), "--listTests", "--ignoreProjects", "ci-scripts", "lint-rules", "--findRelatedTests", file],
    { cwd: root, timeoutMs: 10 * 60 * 1000, children, logFile },
  );
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("/"))
    .map((l) => path.relative(root, l))
    .filter((l) => /\.unit\.spec\.[jt]sx?$/.test(l));
}

export async function runTypeCheck({ root, children, logFile }) {
  const bin = path.join(root, "node_modules", "typescript7", "bin", "tsc");
  const fallback = path.join(root, "node_modules", "typescript", "bin", "tsc");
  const tsc = fs.existsSync(bin) ? bin : fs.existsSync(fallback) ? fallback : null;
  if (!tsc) {
    return { ok: false, reason: "no TypeScript compiler in node_modules" };
  }
  const r = await runProcess(process.execPath, [tsc, "--noEmit"], { cwd: root, timeoutMs: 20 * 60 * 1000, children, logFile });
  const errors = (r.stdout || "").split("\n").filter((l) => /error TS\d+/.test(l));
  if (r.timedOut || (r.code !== 0 && !errors.length)) {
    return { ok: false, reason: r.timedOut ? "the type check timed out" : "the type check crashed", ms: r.ms };
  }
  return { ok: true, errors, ms: r.ms };
}

const decodeXml = (v) =>
  v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function parseJunit(dir) {
  const tests = new Map();
  if (!fs.existsSync(dir)) {
    return tests;
  }
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".xml")) {
      continue;
    }
    const xml = fs.readFileSync(path.join(dir, f), "utf8");
    const re = /<testcase\b((?:\s+[\w:-]+="[^"]*")*)\s*(\/>|>([\s\S]*?)<\/testcase>)/g;
    let m;
    while ((m = re.exec(xml))) {
      const attrs = Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], decodeXml(a[2])]));
      const body = m[3] || "";
      const status = /<failure\b/.test(body)
        ? "failure"
        : /<error\b/.test(body)
          ? "error"
          : /<skipped\b/.test(body) || attrs.assertions === "0"
            ? "skipped"
            : "passed";
      const message = decodeXml((body.match(/message="([^"]*)"/) || [])[1] || body.replace(/<[^>]+>/g, " ")).slice(0, 1500);
      tests.set(`${attrs.classname}/${attrs.name}`, { status, message });
    }
  }
  return tests;
}

export async function runDeftests({ root, selectors, drivers, timeoutMs = 60 * 60 * 1000, children, logFile }) {
  const junit = path.join(root, "target", "junit");
  if (fs.existsSync(junit)) {
    for (const f of fs.readdirSync(junit).filter((x) => x.endsWith(".xml"))) {
      fs.rmSync(path.join(junit, f), { force: true });
    }
  }
  const args = [...(drivers ? [`--drivers=${drivers}`] : []), ":only", `[${selectors.join(" ")}]`];
  const r = await runProcess(path.join(root, "bin", "test-agent"), args, { cwd: root, timeoutMs, children, logFile });
  const tests = parseJunit(junit);
  return { ok: tests.size > 0, tests, ms: r.ms, timedOut: r.timedOut, outputTail: (r.stdout + r.stderr).slice(-2000) };
}
