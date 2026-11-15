import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";
import * as readline from "node:readline/promises";

import { Octokit } from "@octokit/rest";
import fetch from "node-fetch";

import {
  type AlertUpgradeRange,
  type AlertUpgradeVersionsDiff,
  advisoryToRanges,
  assertValidAlertUpgradeVersions,
  buildMessage,
  diffAlertUpgradeVersions,
  fetchAdvisory,
  normalizeAdvisoryVersion,
  parseGhsaId,
  toEditionEntry,
  upsertAlertUpgradeVersions,
} from "./src/alert-upgrade-versions";
import type { AlertUpgradeVersion, VersionInfoFile } from "./src/types";
import {
  getVersionInfoAwsEnv,
  publishVersionInfoFiles,
} from "./version-info-s3";

const DEFAULT_OUT_DIR = "./version-info-out";
const OSS_FILE = "version-info.json";
const EE_FILE = "version-info-ee.json";
const VERSION_INFO_PUBLIC_ORIGIN = "https://static.metabase.com";

type GenerateArgs = {
  command: "generate";
  ghsa?: string;
  min?: string;
  fixed?: string;
  id?: string;
  message?: string;
  out: string;
};

type PublishArgs = {
  command: "publish";
  out: string;
};

type CliArgs = GenerateArgs | PublishArgs;

const USAGE = `Usage:
  bun alert-upgrade-versions generate <GHSA id or URL> [--message "..."] [--out ${DEFAULT_OUT_DIR}]
  bun alert-upgrade-versions generate --min x.63.0 --fixed x.63.10 [--id some-id] [--message "..."] [--out ${DEFAULT_OUT_DIR}]
  bun alert-upgrade-versions publish [--out ${DEFAULT_OUT_DIR}]`;

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.command === "generate") {
    await generate(args);
    return;
  }

  await publish(args);
}

async function generate(args: GenerateArgs) {
  const { ranges, warnings, id, severity, url } = await resolveRanges(args);
  const template = args.message;

  await mkdir(args.out, { recursive: true });

  for (const edition of ["oss", "ee"] as const) {
    const remote = await fetchVersionInfoFile(edition);
    const entries = ranges.map((range) =>
      editionEntry({ range, edition, template, severity, url, id }),
    );
    const local = upsertAlertUpgradeVersions(remote, entries, id);
    const fileName = edition === "ee" ? EE_FILE : OSS_FILE;
    const filePath = path.join(args.out, fileName);
    await writeFile(filePath, `${JSON.stringify(local, null, 2)}\n`);

    const diff = diffAlertUpgradeVersions(remote, local);
    printEditionSummary(edition, filePath, diff);
  }

  if (warnings.length > 0) {
    console.log("\nParser warnings:");
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

async function publish(args: PublishArgs) {
  const { bucket, distributionId } = getVersionInfoAwsEnv();
  const ossPath = path.join(args.out, OSS_FILE);
  const eePath = path.join(args.out, EE_FILE);

  const localOss = await readVersionInfoFile(ossPath);
  const localEe = await readVersionInfoFile(eePath);
  assertValidAlertUpgradeVersions(localOss.alert_upgrade_versions ?? []);
  assertValidAlertUpgradeVersions(localEe.alert_upgrade_versions ?? []);

  const remoteOss = await fetchVersionInfoFile("oss");
  const remoteEe = await fetchVersionInfoFile("ee");
  const ossDiff = diffAlertUpgradeVersions(remoteOss, localOss);
  const eeDiff = diffAlertUpgradeVersions(remoteEe, localEe);

  if (ossDiff.otherKeysDiffer || eeDiff.otherKeysDiffer) {
    throw new Error(
      "Refusing to publish: a key other than alert_upgrade_versions changed vs remote. Re-run generate.",
    );
  }

  if (!hasEntryChanges(ossDiff) && !hasEntryChanges(eeDiff)) {
    throw new Error("No alert_upgrade_versions changes to publish");
  }

  console.log("OSS diff vs remote:");
  printDiff(ossDiff);
  console.log("\nEE diff vs remote:");
  printDiff(eeDiff);

  await confirmPublish();

  await publishVersionInfoFiles({
    files: [ossPath, eePath],
    bucket,
    distributionId,
  });

  console.log(`Published ${OSS_FILE} and ${EE_FILE} to s3://${bucket}`);
}

async function resolveRanges(args: GenerateArgs): Promise<{
  ranges: AlertUpgradeRange[];
  warnings: string[];
  id?: string;
  severity: string;
  url: string;
}> {
  if (args.min || args.fixed) {
    if (!args.min || !args.fixed) {
      throw new Error("Both --min and --fixed are required for a manual range");
    }
    return {
      ranges: [
        {
          min: normalizeAdvisoryVersion(args.min),
          fixed: normalizeAdvisoryVersion(args.fixed),
        },
      ],
      warnings: [],
      id: args.id ?? (args.ghsa ? parseGhsaId(args.ghsa) : undefined),
      severity: "critical",
      url: "",
    };
  }

  if (!args.ghsa) {
    throw new Error(`Missing GHSA id or --min/--fixed\n\n${USAGE}`);
  }

  const ghsaId = parseGhsaId(args.ghsa);
  const github = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const advisory = await fetchAdvisory({
    github,
    owner: process.env.GITHUB_OWNER ?? "metabase",
    repo: process.env.GITHUB_REPO ?? "metabase",
    ghsaId,
  });
  const { ranges, warnings } = advisoryToRanges(advisory);

  return {
    ranges,
    warnings,
    id: args.id ?? ghsaId,
    severity: advisory.severity ?? "critical",
    url: advisory.html_url,
  };
}

function editionEntry({
  range,
  edition,
  template,
  severity,
  url,
  id,
}: {
  range: AlertUpgradeRange;
  edition: "oss" | "ee";
  template?: string;
  severity: string;
  url: string;
  id?: string;
}): AlertUpgradeVersion {
  const { min, fixed } = toEditionEntry(range, edition, "");
  const message = buildMessage({
    template,
    fixed: fixed.replace(/^v/, ""),
    severity,
    url,
  });
  return id ? { min, fixed, message, id } : { min, fixed, message };
}

async function fetchVersionInfoFile(
  edition: "oss" | "ee",
): Promise<VersionInfoFile> {
  const fileName = edition === "ee" ? EE_FILE : OSS_FILE;
  const url = `${VERSION_INFO_PUBLIC_ORIGIN}/${fileName}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const payload: unknown = await response.json();
  return parseVersionInfoFile(payload, url);
}

async function readVersionInfoFile(filePath: string): Promise<VersionInfoFile> {
  const text = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(text);
  return parseVersionInfoFile(parsed, filePath);
}

function parseVersionInfoFile(value: unknown, label: string): VersionInfoFile {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} is not a JSON object`);
  }
  if (!("latest" in value) || !("older" in value)) {
    throw new Error(`${label} is missing latest/older`);
  }
  // Remote/local JSON is a VersionInfoFile; extra keys must be preserved for the publish guard.
  return value as VersionInfoFile;
}

function printEditionSummary(
  edition: "oss" | "ee",
  filePath: string,
  diff: AlertUpgradeVersionsDiff,
) {
  console.log(`\n${edition.toUpperCase()} wrote ${filePath}`);
  printDiff(diff);
}

function printDiff(diff: AlertUpgradeVersionsDiff) {
  printEntryList("added", diff.added);
  printEntryList("removed", diff.removed);
  if (diff.changed.length === 0) {
    console.log("  changed: (none)");
  } else {
    console.log("  changed:");
    for (const change of diff.changed) {
      console.log(
        `    - ${formatEntry(change.from)} -> ${formatEntry(change.to)}`,
      );
    }
  }
}

function printEntryList(label: string, entries: AlertUpgradeVersion[]) {
  if (entries.length === 0) {
    console.log(`  ${label}: (none)`);
    return;
  }
  console.log(`  ${label}:`);
  for (const entry of entries) {
    console.log(`    - ${formatEntry(entry)}`);
  }
}

function formatEntry(entry: AlertUpgradeVersion): string {
  const id = entry.id ? ` id=${entry.id}` : "";
  return `${entry.min} -> ${entry.fixed}${id}`;
}

function hasEntryChanges(diff: AlertUpgradeVersionsDiff): boolean {
  return (
    diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0
  );
}

async function confirmPublish() {
  if (!stdin.isTTY) {
    throw new Error(
      "Publish requires interactive confirmation (stdin is not a TTY)",
    );
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question("Publish these files to S3? [y/N] ");
    const normalized = answer.trim().toLowerCase();
    if (normalized !== "y" && normalized !== "yes") {
      throw new Error("Publish aborted");
    }
  } finally {
    rl.close();
  }
}

function parseCliArgs(argv: string[]): CliArgs {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    throw new Error(USAGE);
  }

  const [command, ...rest] = argv;
  if (command !== "generate" && command !== "publish") {
    throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
  }

  const tokens = [...rest];
  const out = takeFlag(tokens, "--out") ?? DEFAULT_OUT_DIR;

  if (command === "publish") {
    rejectUnknownFlags(tokens, "publish");
    return { command, out };
  }

  const message = takeFlag(tokens, "--message");
  const min = takeFlag(tokens, "--min");
  const fixed = takeFlag(tokens, "--fixed");
  const id = takeFlag(tokens, "--id");
  const positional = tokens.filter((token) => !token.startsWith("--"));
  rejectUnknownFlags(
    tokens.filter((token) => token.startsWith("--")),
    "generate",
  );

  if (positional.length > 1) {
    throw new Error(`Unexpected arguments: ${positional.slice(1).join(" ")}`);
  }

  return {
    command,
    ghsa: positional[0],
    min,
    fixed,
    id,
    message,
    out,
  };
}

function takeFlag(tokens: string[], name: string): string | undefined {
  const index = tokens.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = tokens[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  tokens.splice(index, 2);
  return value;
}

function rejectUnknownFlags(tokens: string[], command: string) {
  const unknown = tokens.filter((token) => token.startsWith("--"));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown flag(s) for ${command}: ${unknown.join(", ")}\n\n${USAGE}`,
    );
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
