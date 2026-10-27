// Turns the weekly Eastwood run's warnings into a Linear report that names the commit behind each finding.
//
//   bun eastwood-report.ts attribute <findings.json> <base-sha|""> <previous.json|""> <target>=<warnings.txt>...
//   bun eastwood-report.ts bisect-targets <findings.json>
//   bun eastwood-report.ts report <findings.json> <bisected.txt> <final.json>
//   bun eastwood-report.ts sync <report.md> <final.json>
//
// A target is `source` or `tests`, the Eastwood alias that produced the warnings file (its `:out`).
// The base is the commit the previous weekly run linted, and `previous.json` holds what that run reported.
//
// `attribute` carries over the findings the previous run already reported, with their causes.
// It blames each new finding's line: a line changed since the base names its commit.
// The rest are left for `bisect-targets`, which lists one `<target> <namespace> <linter>` per line to bisect.
// The workflow writes each result to `bisected.txt` as `<target> <namespace> <linter> <sha>`.
// `report` folds those in.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { reportIssue } from "./report-issue";

type Cause = { sha: string; subject: string };

export type Finding = {
  target: string;
  file: string;
  line: number;
  column: number;
  linter: string;
  msg: string;
  /** The warning without its line and column, which stays the same when unrelated edits move the code. */
  key: string;
  namespace?: string;
  cause?: Cause;
  /** The date of the run that first reported it. */
  firstSeen?: string;
  /** True when the previous run reported it too. */
  carried?: boolean;
};

/** How many namespaces one run bisects. Each step lints the namespace in a fresh JVM. */
export const MAX_BISECTS = 3;
/** How many findings the report lists. */
export const MAX_LISTED = 300;
/** How long a listed message can be before it is cut. */
export const MAX_MSG = 300;

const WARNING = /^(.+?):(\d+):(\d+): ([a-z-]+)(?: \{:kind \S+\})?: (.*)$/;
const POSITION = /^(.+?):\d+:\d+: /;
const SOURCE_ROOT =
  /^(?:enterprise\/backend\/(?:src|test)|modules\/drivers\/[^/]+\/(?:src|test)|dev\/(?:src|test)|src|test)\/(.+)\.clj[cs]?$/;

/** The namespace a source file defines by Clojure's path convention, or undefined outside our source roots. */
export function namespaceOf(file: string): string | undefined {
  const match = SOURCE_ROOT.exec(file);
  return match?.[1].replaceAll("/", ".").replaceAll("_", "-");
}

/** Warnings from an Eastwood `:out` file. A line that is not a warning continues the previous message. */
export function parseWarnings(target: string, text: string): Finding[] {
  const findings: Finding[] = [];
  for (const line of text.split("\n")) {
    const match = WARNING.exec(line);
    if (match) {
      const [, file, row, column, linter, msg] = match;
      findings.push({
        target,
        file,
        line: Number(row),
        column: Number(column),
        linter,
        msg,
        // eastwood-bisect-check.sh builds the same key with sed.
        key: line.replace(POSITION, "$1: "),
        namespace: namespaceOf(file),
      });
    } else if (line.trim() && !line.startsWith("Entering directory")) {
      const last = findings.at(-1);
      if (last) {
        last.msg += `\n${line}`;
      }
    }
  }
  return findings;
}

/** The items grouped by key, in the order each key first appears. */
function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/** What identifies a finding across runs. */
const matchKey = (finding: Finding) => `${finding.target} ${finding.key}`;

/** What one bisect covers, in the `<target> <namespace> <linter>` form the workflow passes around. */
const bisectKey = ({
  target,
  namespace,
  linter,
}: Pick<Finding, "target" | "namespace" | "linter">) =>
  `${target} ${namespace} ${linter}`;

/**
 * The current findings, with those the previous run reported marked as carried and given its cause and
 * first-seen date. Findings match by target and key, each previous one at most once.
 */
export function carryOver(
  current: Finding[],
  previous: Finding[],
  today: string,
): Finding[] {
  const unmatched = groupBy(previous, matchKey);
  return current.map((finding) => {
    const match = unmatched.get(matchKey(finding))?.shift();
    return match
      ? {
          ...finding,
          cause: match.cause,
          firstSeen: match.firstSeen,
          carried: true,
        }
      : { ...finding, firstSeen: today };
  });
}

/** One `<target> <namespace> <linter>` per new namespace and linter without a cause, at most MAX_BISECTS. */
export function bisectTargets(findings: Finding[]): string[] {
  const keys = findings
    .filter(
      (finding) => !finding.carried && !finding.cause && finding.namespace,
    )
    .map(bisectKey);
  return [...new Set(keys)].slice(0, MAX_BISECTS);
}

/** The findings with each bisected commit filled in where a new finding has no cause. */
export function applyBisected(
  findings: Finding[],
  bisected: string,
  subjectOf: (sha: string) => string,
): Finding[] {
  const culprits = new Map<string, string>();
  for (const line of bisected.split("\n")) {
    const [target, namespace, linter, sha] = line.trim().split(/\s+/);
    if (sha) {
      culprits.set(bisectKey({ target, namespace, linter }), sha);
    }
  }
  return findings.map((finding) => {
    const sha = culprits.get(bisectKey(finding));
    return finding.carried || finding.cause || !sha
      ? finding
      : { ...finding, cause: { sha, subject: subjectOf(sha) } };
  });
}

type ReportContext = {
  date: string;
  runUrl: string;
  /** `https://github.com/<owner>/<repo>` */
  repoUrl: string;
  headSha: string;
  /** The commit the previous run linted, or an empty string when there was none. */
  baseSha: string;
};

const short = (sha: string) => sha.slice(0, 11);

function causeLink(cause: Cause | undefined, repoUrl: string): string {
  if (!cause) {
    return "Cause not found";
  }
  const pr = /^(.*) \(#(\d+)\)$/.exec(cause.subject);
  return pr
    ? `[#${pr[2]}](${repoUrl}/pull/${pr[2]}) ${pr[1]}`
    : `[\`${short(cause.sha)}\`](${repoUrl}/commit/${cause.sha}) ${cause.subject}`;
}

function message(finding: Finding): string {
  const flat = finding.msg.replace(/\s+/g, " ");
  return flat.length > MAX_MSG ? `${flat.slice(0, MAX_MSG)}…` : flat;
}

function item(finding: Finding, { repoUrl, headSha }: ReportContext): string {
  const where = `[\`${finding.file}:${finding.line}\`](${repoUrl}/blob/${headSha}/${finding.file}#L${finding.line})`;
  return `- ${where} \`${finding.linter}\`: ${message(finding)}`;
}

/** Findings grouped under their cause as a heading and its items, the biggest group first and no cause last. */
function byCause(
  findings: Finding[],
  context: ReportContext,
  withFirstSeen: boolean,
): string[][] {
  const groups = groupBy(findings, (finding) => finding.cause?.sha ?? "");
  return [...groups.entries()]
    .sort(
      ([a, x], [b, y]) =>
        Number(a === "") - Number(b === "") || y.length - x.length,
    )
    .map(([, group]) => {
      const firstSeen = group
        .map((finding) => finding.firstSeen ?? "")
        .sort()[0];
      const seen =
        withFirstSeen && firstSeen ? `, first seen ${firstSeen}` : "";
      return [
        `### ${causeLink(group[0].cause, context.repoUrl)}${seen}`,
        ...group.map((finding) => item(finding, context)),
      ];
    });
}

/** The Linear description: new findings, then those still open, each grouped under its likely cause. */
export function formatReport(
  findings: Finding[],
  context: ReportContext,
): string {
  const { date, runUrl, repoUrl, baseSha } = context;
  const fresh = findings.filter((finding) => !finding.carried);
  const open = findings.filter((finding) => finding.carried);

  const lines = [
    `> Generated by [\`eastwood.yml\`](${repoUrl}/blob/master/.github/workflows/eastwood.yml). Each weekly run replaces this description, so edits here are lost: comment instead.`,
    "",
  ];
  const sections: [string, string[][]][] = [];
  if (baseSha) {
    lines.push(
      `The weekly Eastwood run found **${findings.length} findings** on ${date} ([run](${runUrl})): ${fresh.length} new since the previous run at [\`${short(baseSha)}\`](${repoUrl}/commit/${baseSha}).`,
      `A new finding on a line changed since then is listed under that change. The rest are bisected, up to ${MAX_BISECTS} namespaces a run.`,
    );
    sections.push(
      ["New since the previous run", byCause(fresh, context, false)],
      ["Still open", byCause(open, context, true)],
    );
  } else {
    lines.push(
      `The weekly Eastwood run found **${findings.length} findings** on ${date} ([run](${runUrl})).`,
      "No earlier run left a report to compare with, so each finding is listed under the commit that last changed its line.",
    );
    sections.push(["Findings", byCause(findings, context, false)]);
  }

  let budget = MAX_LISTED;
  for (const [title, groups] of sections) {
    if (groups.length === 0 || budget <= 0) {
      continue;
    }
    lines.push("", `## ${title}`);
    for (const [heading, ...items] of groups) {
      if (budget <= 0) {
        break;
      }
      lines.push("", heading, "", ...items.slice(0, budget));
      budget -= items.length;
    }
  }
  if (findings.length > MAX_LISTED) {
    lines.push("", `…and ${findings.length - MAX_LISTED} more in the run.`);
  }
  return lines.join("\n");
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function isAncestor(sha: string, of: string): boolean {
  try {
    git("merge-base", "--is-ancestor", sha, of);
    return true;
  } catch {
    return false;
  }
}

function blame(finding: Finding): string | undefined {
  try {
    const porcelain = git(
      "blame",
      "--porcelain",
      "-L",
      `${finding.line},${finding.line}`,
      "HEAD",
      "--",
      finding.file,
    );
    return porcelain.split(" ")[0];
  } catch {
    return undefined;
  }
}

const subjectOf = (sha: string) => git("log", "-1", "--format=%s", sha);

/**
 * The findings with each new one blamed on the last change to its line.
 * With a base, only a change since the base counts.
 */
function attribute(findings: Finding[], baseSha: string): Finding[] {
  return findings.map((finding) => {
    if (finding.carried) {
      return finding;
    }
    const sha = blame(finding);
    const blamed = sha && (!baseSha || !isAncestor(sha, baseSha));
    return blamed
      ? { ...finding, cause: { sha, subject: subjectOf(sha) } }
      : finding;
  });
}

const readText = (file: string) =>
  file && existsSync(file) ? readFileSync(file, "utf8") : "";

const readFindings = (file: string): Finding[] => {
  const text = readText(file);
  return text ? JSON.parse(text) : [];
};

const writeFindings = (file: string, findings: Finding[]) =>
  writeFileSync(file, JSON.stringify(findings, null, 2));

async function main([command, ...args]: string[]) {
  const env = process.env;
  const today = new Date().toISOString().slice(0, 10);
  switch (command) {
    case "attribute": {
      const [out, baseSha, previous, ...inputs] = args;
      const current = inputs.flatMap((input) => {
        const [target, file] = input.split("=");
        return parseWarnings(target, readText(file));
      });
      const findings = carryOver(current, readFindings(previous), today);
      writeFindings(out, attribute(findings, baseSha));
      return;
    }
    case "bisect-targets":
      for (const target of bisectTargets(readFindings(args[0]))) {
        console.log(target);
      }
      return;
    case "report": {
      const [file, bisected, out] = args;
      const findings = applyBisected(
        readFindings(file),
        readText(bisected),
        subjectOf,
      );
      writeFindings(out, findings);
      console.log(
        findings.length === 0
          ? ""
          : formatReport(findings, {
              date: today,
              runUrl: env.RUN_URL ?? "",
              repoUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`,
              headSha: env.GITHUB_SHA ?? "",
              baseSha: env.BASE_SHA ?? "",
            }),
      );
      return;
    }
    case "sync": {
      const [report, file] = args;
      const findings = readFindings(file);
      const fresh = findings.filter((finding) => !finding.carried).length;
      return reportIssue({
        title: "metabase/metabase Eastwood report",
        report: readText(report).trim(),
        opened: (link) =>
          `:broom: The weekly Eastwood run found ${findings.length} findings in metabase/metabase: ${link}`,
        updated: (link) =>
          fresh > 0
            ? `:broom: The weekly Eastwood run found ${fresh} new findings in metabase/metabase, ${findings.length} in all: ${link}`
            : undefined,
        closed: (link) =>
          `:white_check_mark: Eastwood passes again on metabase/metabase, closed ${link}`,
        closedComment: `Eastwood passes as of ${env.RUN_URL}`,
      });
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

// `import.meta.main` keeps the specs, which import the helpers above, from running the script.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
