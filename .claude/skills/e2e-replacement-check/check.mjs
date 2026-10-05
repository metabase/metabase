#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { branchName, changedFiles, gitDir, headSha, isIgnored, repoRoot, resolveBase } from "./lib/git.mjs";
import { createGuard } from "./lib/guard.mjs";
import { USAGE, parseArgs } from "./lib/options.mjs";
import { detailsReport, prReport } from "./lib/report.mjs";
import { runCheck } from "./lib/run.mjs";
import { cljExistingForPath, cljExistingForPr } from "./lib/clj-existing.mjs";
import { existingForPath, existingForPr } from "./lib/existing.mjs";
import { computeScope, deftestScope, loadTypescript, perSpecHint } from "./lib/scope.mjs";

function outDirFor(root, opts) {
  const dir = opts.out
    ? path.resolve(opts.out)
    : path.join(
        os.tmpdir(),
        "e2e-replacement-check",
        [path.basename(root), branchName(root) ?? headSha(root).slice(0, 11), ...opts.specs.map((s) => path.basename(s).replace(/\.cy\.spec\.[jt]sx?$/, ""))]
          .join("-")
          .replace(/[^\w.-]+/g, "_"),
      );
  const rel = path.relative(root, dir);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    fs.mkdirSync(dir, { recursive: true });
    if (!isIgnored(root, rel)) {
      throw new Error(`${dir} is inside the repo and not ignored by git, so the output could be committed; pick another --out`);
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function scopeFor(root, opts) {
  const { ref, mergeBase } = resolveBase(root, opts.base);
  return computeScope({ root, mergeBase, baseRef: ref, head: headSha(root), branch: branchName(root), specs: opts.specs });
}

function printScope(scope, outDir, tool) {
  const lines = [`Merge base ${scope.merge_base.slice(0, 11)} with ${scope.base_ref}.`, ""];
  if (!scope.removed_tests.length) {
    lines.push("This branch deletes or shrinks no e2e tests, so there is nothing to check.");
    return lines.join("\n");
  }
  const hint = perSpecHint(scope);
  if (hint) {
    lines.push(hint, "");
  }
  if (scope.specs?.length) {
    lines.push(`Limited to ${scope.specs.join(", ")}.`);
  }
  lines.push(`Deleted or shrunk e2e tests (${scope.removed_tests.length}):`);
  for (const t of scope.removed_tests) {
    lines.push(`- [${t.fate}] ${t.id}`);
    lines.push(`  lines ${t.lines_at_merge_base.join("-")} at the merge base: git show ${scope.merge_base.slice(0, 11)}:${t.spec}`);
    if (t.possibly_merged_into) {
      lines.push(`  ${Math.round(t.share_of_lines_kept * 100)}% of its lines are in ${t.possibly_merged_into}`);
    }
    for (const a of t.removed_assertions.slice(0, 6)) {
      lines.push(`  removed: ${a.slice(0, 140)}`);
    }
    if (t.removed_assertions.length > 6) {
      lines.push(`  and ${t.removed_assertions.length - 6} more removed assertion lines`);
    }
  }
  lines.push("", "This PR's new and changed unit tests:");
  for (const j of scope.unit.jest) {
    lines.push(`- ${j.spec} (${j.status}, ${j.new_tests.length} new test(s))`);
  }
  for (const d of scope.unit.deftests) {
    lines.push(`- ${d.file}: ${d.id} (${d.status}${d.driver ? `, needs the ${d.driver} driver` : ""})`);
  }
  if (!scope.unit.jest.length && !scope.unit.deftests.length) {
    lines.push("- none found in the diff");
  }
  lines.push(
    "",
    `Scope written to ${path.join(outDir, "scope.json")}.`,
    `Next: follow step 2 of ${path.join(tool, "PROMPT.md")}, write the breaks to ${path.join(outDir, "breaks.json")} and the protected list to ${path.join(outDir, "protected.md")}, then run:`,
    `  node ${path.relative(scope.root, path.join(tool, "check.mjs"))} run${scope.specs?.length ? ` --spec ${scope.specs.join(",")}` : ""}`,
  );
  return lines.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tool = path.dirname(new URL(import.meta.url).pathname);
  const root = repoRoot(process.cwd());
  if (opts.command === "restore") {
    const restored = createGuard({ root, stateDir: path.join(gitDir(root), "e2e-replacement-check") }).recoverLeftover();
    console.log(restored.length ? `Restored ${restored.join(", ")}.` : "No break was left applied.");
    return;
  }
  if (opts.command === "existing") {
    const ts = loadTypescript(root);
    const results = [];
    if (opts.paths.length) {
      for (const target of opts.paths) {
        const rel = path.relative(root, path.resolve(target));
        if (!fs.existsSync(path.join(root, rel))) {
          throw new Error(`${target} doesn't exist`);
        }
        results.push(/\.cljc?$/.test(rel) ? cljExistingForPath({ root, target: rel }) : await existingForPath({ ts, root, target: rel }));
      }
    } else {
      const { mergeBase } = resolveBase(root, opts.base);
      const jest = await existingForPr({ ts, root, mergeBase });
      const deftests = deftestScope(root, mergeBase, changedFiles(root, mergeBase));
      const sides = [...(jest.none ? [] : [["Jest specs", jest]]), ...(deftests.length ? [["Deftests", cljExistingForPr({ root, deftests })]] : [])];
      if (!sides.length) {
        results.push({ text: "This branch adds or changes no jest specs or deftests.", ms: jest.ms });
      }
      for (const [heading, r] of sides) {
        results.push(sides.length > 1 ? { ...r, text: `${heading}\n\n${r.text}` } : r);
      }
    }
    console.log(results.map((r) => r.text).join("\n\n"));
    const ms = results.reduce((n, r) => n + r.ms, 0);
    console.log(`\nTook ${ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}.`);
    return;
  }
  if (opts.command !== "scope" && opts.command !== "run") {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const outDir = outDirFor(root, opts);
  const scope = scopeFor(root, opts);
  fs.writeFileSync(path.join(outDir, "scope.json"), JSON.stringify(scope, null, 1));
  if (opts.command === "scope") {
    console.log(printScope(scope, outDir, tool));
    return;
  }
  const breaksFile = opts.breaks ? path.resolve(opts.breaks) : path.join(outDir, "breaks.json");
  if (!fs.existsSync(breaksFile)) {
    throw new Error(`no breaks file at ${breaksFile}; run the scope step and write the breaks first`);
  }
  const raw = JSON.parse(fs.readFileSync(breaksFile, "utf8"));
  const run = await runCheck({
    root,
    scope,
    raw,
    outDir,
    log: (m) => console.error(m),
    options: opts.run,
  });
  const report = prReport(scope, run);
  fs.writeFileSync(path.join(outDir, "report.md"), report);
  fs.writeFileSync(path.join(outDir, "details.md"), detailsReport(scope, run));
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ scope, run }, null, 1));
  console.log(report);
  console.log(
    run.working_tree.clean
      ? `Working tree: the ${run.working_tree.files.length} file(s) the breaks touched match HEAD, as they did at the start.`
      : `WORKING TREE NOT CLEAN: ${run.working_tree.status.join(", ")}. Run: node .claude/skills/e2e-replacement-check/check.mjs restore`,
  );
  console.log(`Run took ${Math.round(run.wall_ms / 1000)} s. Report: ${path.join(outDir, "report.md")}. Details and patches: ${path.join(outDir, "details.md")}.`);
  if (!run.working_tree.clean) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
