import path from "node:path";

import { shortTest } from "./run.mjs";

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

function testLabel(scope, id) {
  const t = scope.removed_tests.find((r) => r.id === id);
  if (!t) {
    return id ? `${id} (not a deleted test in the scope)` : "(no test named)";
  }
  const spec = path.basename(t.spec).replace(/\.cy\.spec\.[jt]sx?$/, "");
  return `${spec} › ${t.it}${t.fate === "deleted" ? "" : ` (${t.fate})`}`;
}

function breakLabel(b) {
  const c = b.changes?.[0];
  const where = c ? ` (\`${path.basename(c.file)}:${c.lines?.[0]?.[0] ?? "?"}\`)` : "";
  return `${b.description || "(no description)"}${where}`;
}

export function resultText(r) {
  if (!r) {
    return "unmeasured: not run";
  }
  if (r.state === "caught") {
    const first = r.by[0] === "the type checker" ? r.by[0] : shortTest(r.by[0]);
    const more = r.by.length > 1 ? ` and ${r.by.length - 1} more` : "";
    if (r.layer === "pr") {
      return `caught: ${first}${more}`;
    }
    if (r.layer === "type-check") {
      return "nothing failed in this PR's tests; caught by the type checker";
    }
    return `nothing failed in this PR's tests; caught by existing ${first}${more}`;
  }
  if (r.state === "nothing") {
    const parts = ["nothing failed"];
    if (r.noLine) {
      parts.push("no spec ran the line");
    }
    if (!r.prHasSpecs) {
      parts.push(`this PR has no ${r.backend ? "backend" : "frontend"} unit tests`);
    }
    if (r.driverNote) {
      parts.push(r.driverNote);
    }
    return parts.join("; ");
  }
  if (r.state === "not-run") {
    return r.text;
  }
  return `unmeasured: ${r.text}${r.driverNote ? `; ${r.driverNote}` : ""}`;
}

export function prReport(scope, run) {
  const lines = [
    `Each row is one break in code a deleted or shrunk e2e test drove, run against this PR's tests, then against the nearest existing specs and the type checker if nothing failed. "nothing failed" means no unit test that ran noticed the break, not that the deleted e2e test would have.`,
    "",
    "| Deleted e2e test | Break | Result |",
    "| -- | -- | -- |",
    ...run.breaks.map((b) => `| ${cell(testLabel(scope, b.test))} | ${cell(breakLabel(b))} | ${cell(resultText(b.result))} |`),
  ];
  const leftOut = [
    ...(run.groups.pr?.clean_failing ?? []).map(shortTest),
    ...Object.keys(run.groups.pr?.suite_errors ?? {}).map((s) => `${path.basename(s)} (doesn't load)`),
    ...(run.backend_clean_failing ?? []),
  ];
  if (leftOut.length) {
    lines.push("", `These tests from this PR fail on clean code in this checkout, so no break was measured against them: ${leftOut.join("; ")}.`);
  }
  const byDriver = new Map();
  for (const d of run.deftests_needing_driver ?? []) {
    byDriver.set(d.driver, [...(byDriver.get(d.driver) ?? []), d.id]);
  }
  for (const [driver, ids] of byDriver) {
    lines.push("", `Unmeasured: this PR's ${driver} deftests (${ids.join(", ")}) didn't run, because they need the ${driver} driver and its database. Set \`DRIVERS=${driver}\` with the database running to include them.`);
  }
  if (run.auto.length) {
    const count = (pred) => run.auto.filter(pred).length;
    const caught = count((m) => m.result.state === "caught");
    const nothing = count((m) => m.result.state === "nothing");
    const noLine = count((m) => m.result.state === "not-run");
    const unmeasured = count((m) => m.result.state === "unmeasured");
    lines.push(
      "",
      `Automatic mutants in the same files: ${run.auto.length} planted, ${caught} caught, ${nothing} nothing failed, ${noLine} no spec ran the line, ${unmeasured} unmeasured.`,
    );
    const leads = run.auto.filter((m) => m.result.state === "nothing" || m.result.state === "not-run");
    if (leads.length) {
      lines.push("", "<details><summary>Automatic mutants that no test caught</summary>", "");
      for (const m of leads) {
        lines.push(`- \`${m.file}:${m.lines[0][0]}\`: ${m.description}. ${resultText(m.result)}.`);
      }
      lines.push("", "</details>");
    }
  }
  return lines.join("\n") + "\n";
}

const fence = (text, lang = "") => ["```" + lang, text.trimEnd(), "```"].join("\n");

function stageLines(name, s) {
  if (!s) {
    return [];
  }
  if (s.unmeasured && !s.ran) {
    return [`- ${name}: unmeasured, ${s.unmeasured}`];
  }
  if (s.caught !== undefined) {
    return [`- ${name}: ${s.caught ? `new errors\n${fence(s.errors.join("\n"))}` : "no new errors"}`];
  }
  const out = [`- ${name}: ${s.specs?.length ?? s.selectors?.length ?? 0} spec(s) or selector(s), ${s.ran.length} test(s) ran`];
  for (const id of s.caught_by) {
    out.push(`  - caught by ${id}: ${(s.failures[id]?.message ?? "").split("\n").find((l) => l.trim()) ?? ""}`);
  }
  for (const id of [...s.errored, ...s.unconfirmed]) {
    out.push(`  - ${id}: ${s.failures[id].reason ?? s.failures[id].kind}`);
  }
  return out;
}

export function detailsReport(scope, run) {
  const out = [
    `# E2e replacement check details`,
    "",
    `Branch \`${scope.branch ?? "(detached)"}\` at ${scope.head.slice(0, 11)}, merge base ${scope.merge_base.slice(0, 11)} with ${scope.base_ref}. Run took ${Math.round(run.wall_ms / 1000)} s.`,
    "",
    run.working_tree.clean
      ? `Working tree: the ${run.working_tree.files.length} file(s) the breaks touched match HEAD, as they did at the start.`
      : `WORKING TREE NOT CLEAN after the run: ${run.working_tree.status.join(", ")}. Restore with \`node .claude/skills/e2e-replacement-check/check.mjs restore\` or \`git checkout -- <file>\`.`,
    "",
    `This PR's jest specs: ${run.pr_specs.length ? run.pr_specs.join(", ") : "none"}.`,
    `Related specs run when nothing failed: ${run.groups.related?.specs.length ? run.groups.related.specs.join(", ") : "none"}.`,
    `This PR's deftests: ${scope.unit.deftests.length ? scope.unit.deftests.map((d) => d.id + (d.driver ? ` (needs ${d.driver})` : "")).join(", ") : "none"}.`,
    "",
    "## Breaks",
  ];
  for (const b of run.breaks) {
    out.push("", `### ${b.id}. ${b.description || "(no description)"}`, "");
    out.push(`- Deleted test: ${b.test ?? "(none named)"}`);
    if (b.assertion) {
      out.push(`- Removed assertion it should fail: \`${b.assertion}\``);
    }
    if (b.checks) {
      out.push(`- What it checked: ${b.checks}`);
    }
    out.push(`- Result: ${resultText(b.result)}`);
    const fe = b.results?.frontend;
    if (fe?.line_ran_in) {
      out.push(`- Specs that ran the changed lines on clean code: ${fe.line_ran_in.length ? fe.line_ran_in.join(", ") : "none"}`);
    }
    if (fe) {
      out.push(...stageLines("this PR's specs", fe.stages.pr), ...stageLines("related specs", fe.stages.related), ...stageLines("type check", fe.stages.type_check));
    }
    if (b.results?.backend) {
      out.push(...stageLines("backend tests", b.results.backend));
    }
    if (b.ms) {
      out.push(`- Time: ${Math.round(b.ms / 1000)} s`);
    }
    for (const c of b.changes ?? []) {
      out.push("", fence(c.patch, "diff"));
    }
  }
  if (run.auto.length) {
    out.push("", "## Automatic mutants");
    for (const m of run.auto) {
      out.push("", `### ${m.id}. ${m.operator} in \`${m.file}:${m.lines[0][0]}\``, "", `- ${m.description}`, `- Result: ${resultText(m.result)}`);
      out.push(...stageLines("this PR's specs", m.stages?.pr), ...stageLines("related specs", m.stages?.related));
      out.push("", fence(m.patch, "diff"));
    }
  }
  out.push("", "## Time", "", "| Step | Seconds |", "| -- | -- |");
  for (const [k, ms] of Object.entries(run.timings)) {
    out.push(`| ${k} | ${Math.round(ms / 1000)} |`);
  }
  out.push(`| total | ${Math.round(run.wall_ms / 1000)} |`);
  return out.join("\n") + "\n";
}
