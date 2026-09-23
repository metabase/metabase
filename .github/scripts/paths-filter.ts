#!/usr/bin/env bun
/**
 * A tiny stand-in for dorny/paths-filter.
 *
 * Reads a YAML file of named groups, each a list of globs, works out which
 * files changed in a git range, and reports which groups those files touch.
 *
 * Usage:
 *   bun .github/scripts/paths-filter.ts [--config <path>] [--base <ref>] [--head <ref>]
 *
 * Defaults to the current commit (HEAD^...HEAD), and to the config CI already
 * hands to dorny. When GITHUB_OUTPUT is set, writes `<group>=true|false` for
 * every group plus `changes=<json array>`.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

import { load } from "js-yaml";
import { isMatch } from "micromatch";

/** The empty tree, used as the base when HEAD has no parent. */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export type Filters = Record<string, string[]>;

/**
 * A group's value, in any of the shapes the config writes it in: one pattern,
 * a list, or a mapping naming the change types an entry applies to, as in
 * `added|modified` on an entry. Lists nest, because an anchor
 * expanded inside a list — `*shared_sources` — brings a list with it.
 */
export type Filter = string | Filter[] | { [changeType: string]: Filter };

/**
 * The patterns a group holds, whichever shape it was written in.
 *
 * The change types are dropped on the way through: this works off a name-only
 * diff, which cannot tell an add from a modify, so the honest reading of
 * `added|modified: x` is that x counts. That errs towards running a job, which
 * is the direction to err in.
 */
function patterns(value: unknown, group: string): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => patterns(entry, group));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((entry) => patterns(entry, group));
  }

  throw new Error(
    `group "${group}" must be a glob, a list of globs, or a change-type mapping`,
  );
}

export function parseFilters(source: string): Filters {
  const parsed = load(source);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("filter config must be a mapping of group name to globs");
  }

  const filters: Filters = {};

  for (const [group, value] of Object.entries(parsed)) {
    filters[group] = patterns(value, group);
  }

  return filters;
}

/**
 * True when any of the patterns matches the path.
 *
 * dorny/paths-filter matches with picomatch, which micromatch wraps, so this
 * asks a path exactly the question CI asks it — extglobs, brace lists and
 * dotfiles all read the way they read in the config.
 */
export function matchesPath(globs: string[], file: string): boolean {
  return globs.some((pattern) => isMatch(file, pattern, { dot: true }));
}

/** The groups whose globs match at least one of the changed files. */
export function matchGroups(filters: Filters, files: string[]): string[] {
  return Object.entries(filters)
    .filter(([, globs]) => files.some((file) => matchesPath(globs, file)))
    .map(([group]) => group);
}

function git(args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

/** The base to diff `head` against when none was given: its parent, or, for a
 * root commit, nothing at all. */
export function defaultBase(head: string): string {
  return revExists(`${head}^`) ? `${head}^` : EMPTY_TREE;
}

function revExists(ref: string): boolean {
  return (
    spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
      encoding: "utf8",
    }).status === 0
  );
}

export function changedFiles(base: string, head: string): string[] {
  // Three dots diffs against the merge base, which is what we want both for a
  // single commit (HEAD^...HEAD) and for a pull request branch. The empty tree
  // is a tree rather than a commit, so it has no merge base and needs two dots.
  const range = base === EMPTY_TREE ? [base, head] : [`${base}...${head}`];

  return git(["diff", "--name-only", ...range])
    .split("\n")
    .filter((line) => line.length > 0);
}

function parseArgs(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];

    if (flag === undefined || !flag.startsWith("--") || value === undefined) {
      throw new Error(`expected --flag <value> pairs, got: ${argv.join(" ")}`);
    }

    options[flag.slice(2)] = value;
  }

  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const configPath = options.config ?? ".github/file-paths.yaml";
  const head = options.head ?? "HEAD";
  const base = options.base ?? defaultBase(head);

  const filters = parseFilters(readFileSync(configPath, "utf8"));
  const files = changedFiles(base, head);
  const matched = matchGroups(filters, files);

  console.log(`${files.length} file(s) changed in ${base}...${head}`);
  for (const file of files) {
    console.log(`  ${file}`);
  }

  for (const group of Object.keys(filters)) {
    console.log(`${group}: ${matched.includes(group)}`);
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const lines = Object.keys(filters)
      .map((group) => `${group}=${matched.includes(group)}`)
      .concat(`changes=${JSON.stringify(matched)}`)
      .map((line) => `${line}\n`)
      .join("");

    appendFileSync(outputPath, lines);
  }
}

// Bun sets import.meta.main; the repository's TypeScript is configured for
// Node, whose ImportMeta does not declare it.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  main();
}
