// Fixes new Metabot papercuts from Chris's papercuts server with headless Claude Code, one at a time, each in a
// throwaway worktree of the tracker branch, and commits the patch on a local branch. A `/pr` comment on the
// papercut pushes that branch and opens a draft PR, but only with --push; without it the push is a dry run.
//
//   mise exec -- bun fixer.ts [--push] [--match <regex>]   watch the server, fix Metabot papercuts that get a report
//   mise exec -- bun fixer.ts --fix <id>                    one fix attempt for papercut <id>, then exit
//   mise exec -- bun fixer.ts --pr <id> [--push]            the PR step for papercut <id>, then exit
//
// --match limits automatic fixes to papercut titles matching the regex. --full-tests also runs the new test's whole
// namespace, which the demo skips for time. Other flags: --model (default opus) and --timeout <minutes> for the agent
// run (default 25). PAPERCUTS_SERVER and PAPERCUTS_TOKEN come from the
// environment or .env. Each papercut's prompt, agent log, result and PR body go to fixer/<id>/.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readdirSync, renameSync, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";

const argv = process.argv.slice(2);
const opt = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const PUSH = argv.includes("--push");
const MATCH = new RegExp(opt("--match") ?? ".", "i");
const MODEL = opt("--model") ?? "opus";
const TIMEOUT_MS = Number(opt("--timeout") ?? 25) * 60_000;
const FULL_TESTS = argv.includes("--full-tests");

const HOME = process.env.HOME!;
const SERVER = (process.env.PAPERCUTS_SERVER || "http://127.0.0.1:8766").replace(/\/+$/, "");
const TOKEN = process.env.PAPERCUTS_TOKEN;
const REPO = process.env.METABASE_REPO || `${HOME}/src/mb/metabase`;
const BASE = "hackathon-2026-papercut-tracker";
const OUT = `${import.meta.dir}/fixer`;
const ACTOR = "papercut-fixer";
const TRIGGER = /^\s*\/pr\s*$/i;
// Commits removed from the tracker branch's history that must never be pushed again, space or comma separated.
const REMOVED = (process.env.REMOVED_COMMITS ?? "").split(/[\s,]+/).filter(Boolean);
// A stale ControlMaster socket hangs git over SSH on this laptop, and some connections to GitHub stall for a minute.
const SSH = { GIT_SSH_COMMAND: "ssh -o ControlMaster=no -o ControlPath=none -o ConnectTimeout=5" };
const CLAUDE_DIR = `${HOME}/Library/Application Support/Claude/claude-code`;
const CLAUDE = process.env.CLAUDE_BIN || `${CLAUDE_DIR}/${readdirSync(CLAUDE_DIR)
  .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .at(-1)}/claude.app/Contents/MacOS/claude`;

const worktree = (id: number) => `${process.env.WORKTREE_DIR || `${HOME}/src/mb/wt`}/papercut-fix-${id}`;
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const log = (msg: string) => console.log(`${now()} ${msg}`);
const minutes = (ms: number) => `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clean = (s: string) => s.replaceAll("\u2014", "\u2013").trim();
// Papercut ids start over when the server's database is reset, so a papercut is its id plus when it was first seen.
const key = (p: { id: number; first_seen: string }) => `${p.id}@${p.first_seen}`;

async function api(path: string, body?: unknown): Promise<any> {
  const res = await fetch(SERVER + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${json.error ?? ""}`);
  return json;
}

const comment = (id: number, body: string) =>
  api(`/api/papercuts/${id}/comments`, { author: ACTOR, body }).catch((e) => log(`#${id} comment failed: ${e.message}`));

async function sh(cmd: string[], cwd = REPO, env: Record<string, string> = {}) {
  const p = Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`${cmd.join(" ")}: ${(err || out).trim().slice(-400)}`);
  return out.trim();
}

const removedIn = (ref: string, cwd: string) =>
  REMOVED.filter((c) => Bun.spawnSync(["git", "merge-base", "--is-ancestor", c, ref], { cwd }).exitCode === 0);

// Only ever push the fix commit on top of the current tracker branch.
async function checkPushable(branch: string, cwd: string) {
  await retry(5, () => sh(["git", "fetch", "-q", "origin", BASE], REPO, SSH));
  const removed = removedIn(branch, cwd);
  if (removed.length) throw new Error(`${branch} contains ${removed.join(" and ")} from the rewritten history of ${BASE}, not pushing it.`);
  const extra = await sh(["git", "rev-list", "--count", `origin/${BASE}..${branch}`], cwd);
  if (extra !== "1") throw new Error(`${branch} has ${extra} commits that aren't on origin/${BASE} instead of one, not pushing it.`);
}

async function retry<T>(attempts: number, job: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await job();
    } catch (e: any) {
      if (n === attempts) throw e;
      log(`retrying after: ${e.message}`);
      await Bun.sleep(2_000);
    }
  }
}

const SCHEMA = {
  type: "object",
  properties: {
    fixed: { type: "boolean" },
    title: { type: "string" },
    problem: { type: "string" },
    solution: { type: "string" },
    test: { type: "string" },
    failed_without_fix: { type: "boolean" },
  },
  required: ["fixed", "title", "problem", "solution", "test", "failed_without_fix"],
};

function prompt(p: any) {
  return `Fix one papercut in the Metabase codebase. Your working directory is a fresh git worktree of the \`${BASE}\` branch. Work only inside it.

Metabot, Metabase's AI agent, hit this papercut and it was reported to the team's papercut tracker. The report was written against a different checkout that has uncommitted demo code, including a setting that injects search failures on purpose, so its paths, line numbers and that setting may not match this worktree. Fix the product bug the report exposes in this worktree's code. Don't add, restore or look for the demo setting.

<papercut id="${p.id}">
Title: ${p.title}
Path: ${p.path || "none"}
Area: ${p.area || "none"}

${p.description}
</papercut>

Steps:

1. Find the root cause in this worktree. Read the code at the reported path and every caller of the function you plan to change.
2. Write one test for the fix, as simple as the bug allows, in the existing test namespace for that code and in the style of the tests around it. Metabot tools check the caller's scope, so a test that calls a tool through its var, the way the agent does, needs \`metabase.metabot.scope/*current-user-scope*\` bound, for example to \`metabase.api-scope.core/unrestricted\`. Run the test once and see it fail because of the bug: \`./bin/test-agent :only '[the.namespace-test/the-test]' > target/test.log 2>&1\`, exactly in that form, from the working directory, with no pipe and no \`cd\`. Search \`target/test.log\` for \`FAIL in\`, \`ERROR in\` and the \`Ran N tests\` summary rather than reading all of it. If the test fails for another reason, such as a mistake in the test, fix the test first.
3. Make the smallest change that fixes the root cause. No refactoring, no drive-by edits, and no code comments unless one line explains a non-obvious why. Update any existing test that asserts the old behavior.
4. Run the test again and see it pass.${FULL_TESTS ? " Then run its whole namespace once." : ""}
5. Don't commit or change git state. The harness commits your working tree.

Each test run starts a JVM and takes 30 to 60 seconds, and people are watching this fix happen, so keep to ${FULL_TESTS ? "three test runs: one that fails before the fix, one that passes after it and one for the namespace" : "two test runs: one that fails before the fix and one that passes after it"}. Run more only when a run fails for a reason you have to fix.

If the report doesn't point at a bug in this worktree's code, for example because the failure only comes from the demo setting, change nothing and say why.

Your tools: read, search and edit files in this worktree, \`git diff\`, \`git status\`, \`git log\`, \`git show\` and \`./bin/test-agent\`. Everything else is denied, so don't try other commands.

Finish with the structured output:

- fixed: whether you changed code.
- title: the commit and PR title. What changed, in plain English, at most 70 characters, for example "Report search failures to Metabot as tool errors".
- problem: one or two sentences, present tense, on what goes wrong before this change, for a colleague who knows Metabase but not this code. Describe it in terms of this branch's code: the papercut tracker, the turn reviewer that reported it and the demo setting aren't part of this branch, so leave them out.
- solution: at most three sentences on what the change does, stated as a fact ("Search failures now reach...", not "Remove the catch..."), and why this way if a reviewer couldn't tell from the diff. If you changed nothing, why.
- test: the fully qualified test var, such as metabase.metabot.tools.search-test/some-test.
- failed_without_fix: whether a run showed the test failing because of the bug.

In problem and solution, wrap code identifiers in backticks. Never use em dashes. Don't use the words robust, seamless, comprehensive, leverage, delve, trap, guard, gate, wedge, seam, probe or shape.`;
}

// eftest's summary, e.g. "Ran 1 tests in 0.52 seconds\n3 assertions, 0 failures, 0 errors."
const TEST_SUMMARY = /Ran (\d+) tests? in [\d.]+ \w+\s+(\d+) assertions?, (\d+) failures?, (\d+) errors?\./;

async function testSummary(content: unknown, command: string, cwd: string) {
  let text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.text ?? "").join("\n") : "";
  // Claude Code cuts a long tool output, sometimes to a file, and prefixes "Exit code N" when the command fails.
  const exit = /^Exit code (\d+)/.exec(text)?.[1];
  const saved = /saved to:?\s*(\S+)/.exec(text)?.[1];
  const redirected = /> *(\S+)/.exec(command)?.[1];
  if (redirected && existsSync(`${cwd}/${redirected}`)) text = await Bun.file(`${cwd}/${redirected}`).text();
  else if (!TEST_SUMMARY.test(text) && saved && existsSync(saved)) text = await Bun.file(saved).text();
  const m = TEST_SUMMARY.exec(text);
  if (!m) return { passed: !exit, line: `no test summary in the output, exit code ${exit ?? 0}` };
  const [tests, assertions, failures, errors] = m.slice(1).map(Number);
  return {
    passed: tests > 0 && failures + errors === 0,
    line: [plural(tests, "test"), plural(assertions, "assertion"), plural(failures, "failure"), plural(errors, "error")].join(", "),
  };
}

// Settings of this laptop's Claude desktop sessions would reach the agent through the environment, and MB_ settings
// from .env would reach its test JVM.
const childEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC|AI_AGENT|BAGGAGE|MCP_|__CF|MB_|PAPERCUTS_)/.test(k)));

type TestRun = { command: string; passed: boolean; line: string };

function runAgent(id: number, cwd: string, text: string, logPath: string) {
  const args = [
    "-p", text,
    "--output-format", "stream-json", "--verbose",
    "--model", MODEL,
    "--tools", "Read,Edit,Write,Grep,Glob,Bash",
    "--allowedTools", "Bash(./bin/test-agent:*)", "Bash(git diff:*)", "Bash(git status:*)", "Bash(git log:*)", "Bash(git show:*)",
    "--permission-mode", "acceptEdits",
    "--permission-prompts", "none",
    "--strict-mcp-config",
    "--setting-sources", "project,local",
    "--no-session-persistence",
    "--json-schema", JSON.stringify(SCHEMA),
  ];
  const child = spawn(CLAUDE, args, { cwd, env: childEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true });
  const out = createWriteStream(logPath);
  child.stderr.pipe(out, { end: false });
  const commands = new Map<string, string>();
  const runs: TestRun[] = [];
  let result: any = null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { process.kill(-child.pid!, "SIGTERM"); } catch {}
  }, TIMEOUT_MS);
  const lines = createInterface({ input: child.stdout });
  const pending: Promise<unknown>[] = [];
  lines.on("line", (line) => {
    out.write(line + "\n");
    let msg: any;
    try { msg = JSON.parse(line); } catch { return; }
    for (const c of msg.message?.content ?? []) {
      if (c.type === "tool_use") {
        const what = String(c.input?.command ?? c.input?.file_path ?? c.input?.pattern ?? "");
        commands.set(c.id, what);
        log(`#${id} ${c.name} ${what.replace(`${cwd}/`, "").slice(0, 140)}`);
      }
      const command = c.type === "tool_result" ? commands.get(c.tool_use_id) : undefined;
      if (command?.startsWith("./bin/test-agent")) {
        pending.push(testSummary(c.content, command, cwd).then((s) => {
          runs.push({ command, ...s });
          log(`#${id} test run ${runs.length} ${s.passed ? "passed" : "failed"}: ${s.line}`);
        }));
      }
    }
    if (msg.type === "result") result = msg;
  });
  return Promise.all([once(child, "exit"), once(lines, "close")]).then(async ([[code]]) => {
    clearTimeout(timer);
    await Promise.all(pending);
    out.end();
    return { result, runs, timedOut, code: code as number | null };
  });
}

// Unique per run, so a repeated demo never lands on a branch or PR that already exists.
function uniqueBranch(title: string, id: number) {
  let slug = "";
  for (const word of title.toLowerCase().match(/[a-z0-9]+/g) ?? ["patch"]) {
    if (slug.length + word.length >= 35) break;
    slug = slug ? `${slug}-${word}` : word;
  }
  const hhmm = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }).replace(":", "");
  const base = `andreis-papercut-fix-${slug}-${id}-${hhmm}`;
  const taken = (b: string) => Bun.spawnSync(["git", "show-ref", "--verify", "--quiet", `refs/heads/${b}`], { cwd: REPO }).exitCode === 0;
  let branch = base;
  for (let n = 2; taken(branch); n++) branch = `${base}-${n}`;
  return branch;
}

function prBody(id: number, r: any) {
  return `## Problem

${r.problem} The papercut fixer opened this PR from [papercut #${id}](${SERVER}/papercuts/${id}).

## Solution

${r.solution}

## How to verify

\`\`\`sh
./bin/test-agent :only '[${r.test}]'
\`\`\`
`;
}

function archive(id: number) {
  const dir = `${OUT}/${id}`;
  if (existsSync(dir)) renameSync(dir, `${dir}.${Date.now()}`);
}

async function fix(id: number) {
  const fixStarted = Date.now();
  const p = await api(`/api/papercuts/${id}?reports_limit=500`);
  const reportedAt = Math.max(...p.reports.map((r: any) => Date.parse(r.received_at)));
  const dir = `${OUT}/${id}`;
  archive(id);
  mkdirSync(dir, { recursive: true });
  const wt = worktree(id);
  log(`#${id} ${p.title}: fix attempt in ${wt}`);
  await comment(id, `Fix attempt started in a fresh worktree of ${BASE} (${wt.replace(HOME, "~")}).`);
  const fail = async (why: string) => {
    log(`#${id} no patch: ${why}`);
    await comment(id, `No patch: ${why}\nAgent log: ${dir}/agent.jsonl`);
  };
  try {
    await sh(["git", "fetch", "-q", "origin", BASE], REPO, SSH).catch((e) => log(`#${id} fetch failed, using the last fetched ${BASE}: ${e.message}`));
    if (existsSync(wt)) await sh(["git", "worktree", "remove", "--force", wt]);
    await sh(["git", "worktree", "add", "-q", "--detach", wt, `origin/${BASE}`]);
    if (removedIn("HEAD", wt).length) throw new Error(`origin/${BASE} still has its old history here; fetch it and try again.`);
    mkdirSync(`${wt}/target`, { recursive: true });

    const text = prompt(p);
    await Bun.write(`${dir}/prompt.md`, text);

    const agentStarted = Date.now();
    const run = await runAgent(id, wt, text, `${dir}/agent.jsonl`);
    const r = run.result?.structured_output;
    log(`#${id} agent finished in ${minutes(Date.now() - agentStarted)} (exit ${run.code}${run.timedOut ? ", timed out" : ""}, $${run.result?.total_cost_usd?.toFixed(2) ?? "?"})`);
    if (!r) return await fail(run.timedOut ? `the agent ran out of time after ${minutes(TIMEOUT_MS)}.` : `the agent stopped without a result (${run.result?.subtype ?? `exit ${run.code}`}).`);
    if (!r.fixed || !(await sh(["git", "status", "--porcelain"], wt))) {
      await sh(["git", "worktree", "remove", "--force", wt]);
      return await fail(`the agent found nothing to change. ${clean(r.solution)}`);
    }

    const last = run.runs.at(-1);
    const passed = last?.passed ?? false;
    const failedFirst = r.failed_without_fix && run.runs.some((t) => !t.passed);
    await comment(id, `Test ${passed ? "passed" : "failed"}: ${r.test}${passed && failedFirst ? ", which fails without the fix" : ""}.\n` +
      (last ? `Last run: ${last.line}.\n${last.command}` : "The agent never ran it."));
    const title = clean(r.title).split("\n")[0].slice(0, 70);
    const branch = uniqueBranch(title, id);
    await sh(["git", "switch", "-q", "-c", branch], wt);
    await sh(["git", "add", "-A"], wt);
    // Signing needs a GPG passphrase prompt, which nobody answers in the background.
    await sh(["git", "-c", "commit.gpgsign=false", "commit", "-q", "-m", title], wt);
    const sha = await sh(["git", "rev-parse", "--short", "HEAD"], wt);
    const stat = await sh(["git", "diff", "--stat", "HEAD~1"], wt);
    const result = {
      id, first_seen: p.first_seen, branch, worktree: wt, sha, title, problem: clean(r.problem), solution: clean(r.solution),
      test: r.test, test_passed: passed, test_runs: run.runs,
    };
    await Bun.write(`${dir}/result.json`, JSON.stringify(result, null, 2));
    await Bun.write(`${dir}/pr.md`, prBody(id, result));

    const took = minutes(Date.now() - reportedAt);
    log(`#${id} patch ready as ${sha} on ${branch}, ${took} after the latest report, ${minutes(Date.now() - fixStarted)} after the fix started`);
    await comment(id, `Patch ready ${took} after the latest report: ${sha} "${title}" on local branch ${branch}.\n\n` +
      `${result.solution}\n\n${stat}\n\n` +
      (passed ? `Comment /pr to push it and open a draft PR against ${BASE}.` : "Its test didn't pass, so the fixer won't open a PR for it."));
  } catch (e: any) {
    await fail(e.message);
  }
}

async function openPr(id: number) {
  const dir = `${OUT}/${id}`;
  if (!existsSync(`${dir}/result.json`)) return comment(id, "No patch to open a PR from yet.");
  const r = JSON.parse(await Bun.file(`${dir}/result.json`).text());
  const p = await api(`/api/papercuts/${id}?reports_limit=0`);
  if (key(r) !== key(p)) return comment(id, "No patch to open a PR from yet.");
  if (!r.test_passed) return comment(id, `The patch on ${r.branch} didn't pass its test, so there's no PR for it.`);
  if (existsSync(`${dir}/pr-url.txt`)) return comment(id, `PR already open: ${(await Bun.file(`${dir}/pr-url.txt`).text()).trim()}`);
  try {
    await checkPushable(r.branch, r.worktree);
    if (!PUSH) {
      await retry(5, () => sh(["git", "push", "--dry-run", "origin", r.branch], r.worktree, SSH));
      log(`#${id} dry run: push of ${r.branch} would succeed, PR body in ${dir}/pr.md`);
      return comment(id, `Dry run: git push --dry-run of ${r.branch} succeeded. With --push the fixer opens a draft PR against ${BASE} titled "${r.title}".`);
    }
    await retry(5, () => sh(["git", "push", "-q", "-u", "origin", r.branch], r.worktree, SSH));
    const url = await sh(["gh", "pr", "create", "--repo", "metabase/metabase", "--draft", "--base", BASE, "--head", r.branch,
      "--title", r.title, "--body-file", `${dir}/pr.md`], r.worktree);
    await Bun.write(`${dir}/pr-url.txt`, url);
    log(`#${id} opened ${url}`);
    await comment(id, `Draft PR: ${url}`);
    await sh(["git", "worktree", "remove", r.worktree]).catch((e) => log(`#${id} kept the worktree: ${e.message}`));
  } catch (e: any) {
    log(`#${id} PR step failed: ${e.message}`);
    await comment(id, `PR step failed: ${e.message}`);
  }
}

// One agent at a time, since each runs a test JVM next to dev-ee.
let fixes = Promise.resolve();
let prs = Promise.resolve();
const queue = (chain: Promise<void>, job: () => Promise<unknown>) => chain.then(job).then(() => {}, (e) => log(`job failed: ${e.message}`));

async function watch() {
  const started = Date.now();
  // A papercut gets a fix attempt when it first appears or, if it was already there, when a new report arrives.
  const lastSeen = new Map<string, string>();
  const attempted = new Set<string>();
  const acted = new Set<string>();
  const first = await retry(30, () => api("/api/papercuts?limit=500"));
  first.papercuts.forEach((p: any) => lastSeen.set(key(p), p.last_seen));
  let cursor: string | null = first.cursor;
  log(`watching ${SERVER} with ${lastSeen.size} papercuts already there; the PR step ${PUSH ? "pushes and opens draft PRs" : "is a dry run"}`);
  for (;;) {
    try {
      const r = await api(`/api/papercuts?limit=500&sort=oldest${cursor ? `&since=${encodeURIComponent(cursor)}` : ""}`);
      if (cursor && (!r.cursor || r.cursor < cursor)) {
        log("the server's database was reset, starting over");
        cursor = null;
        continue;
      }
      for (const p of r.papercuts) {
        const k = key(p);
        if (p.merged_into) continue;
        const reported = !lastSeen.has(k) || p.last_seen > lastSeen.get(k)!;
        if (reported && !attempted.has(k) && p.fingerprints.some((f: string) => f.startsWith("metabot:")) && MATCH.test(p.title)) {
          log(`#${p.id} ${lastSeen.has(k) ? "new report on" : "new"} Metabot papercut: ${p.title}`);
          attempted.add(k);
          archive(p.id);
          fixes = queue(fixes, () => fix(p.id));
        }
        if (!attempted.has(k) && !existsSync(`${OUT}/${p.id}/result.json`)) continue;
        const { events } = await api(`/api/papercuts/${p.id}?reports_limit=0`);
        for (const e of events) {
          const event = `${key(p)}/${e.id}`;
          if (e.kind !== "comment" || e.actor === ACTOR || acted.has(event) || Date.parse(e.at) < started || !TRIGGER.test(e.body ?? "")) continue;
          acted.add(event);
          log(`#${p.id} ${e.body.trim()} from ${e.actor}`);
          prs = queue(prs, () => openPr(p.id));
        }
      }
      cursor = r.cursor ?? cursor;
    } catch (e: any) {
      log(`poll failed: ${e.message}`);
    }
    await Bun.sleep(2_000);
  }
}

if (opt("--fix")) await fix(Number(opt("--fix")));
else if (opt("--pr")) await openPr(Number(opt("--pr")));
else await watch();
