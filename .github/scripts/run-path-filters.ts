// Entry point for the changed-files gate. Runs anywhere bun does.
//
//   # what would CI run for my branch?
//   bun .github/scripts/run-path-filters.ts
//
//   # against a different base, or a hypothetical set of files
//   bun .github/scripts/run-path-filters.ts --base release-x.63.x
//   bun .github/scripts/run-path-filters.ts --files src/metabase/core.clj docs/x.md
//
//   # machine-readable, and the shape CI consumes
//   bun .github/scripts/run-path-filters.ts --json
//   bun .github/scripts/run-path-filters.ts --github-output --list-files csv
//
// Locally the diff is `<base>...HEAD`, i.e. committed work only — the same view
// CI has. Uncommitted changes are not included.

import { appendFileSync, readFileSync } from "node:fs";

import {
  parseNameStatus,
  readEventContext,
  resolveChangeSet,
  runCommand,
} from "./changed-files";
import {
  type ChangeSet,
  type ChangedFile,
  type FilterResult,
  matchFilters,
  parseFilters,
} from "./path-filters";

const FILTER_FILE = ".github/file-paths.yaml";
const LIST_FORMATS = ["none", "csv", "json", "shell"] as const;

type ListFormat = (typeof LIST_FORMATS)[number];

type Options = {
  base: string;
  files: string[] | null;
  json: boolean;
  githubOutput: boolean;
  listFiles: ListFormat;
  filterFile: string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    base: "master",
    files: null,
    json: false,
    githubOutput: false,
    listFiles: "none",
    filterFile: FILTER_FILE,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case "--base":
        options.base = argv[++index];
        break;
      case "--filters":
        options.filterFile = argv[++index];
        break;
      case "--list-files":
        options.listFiles = argv[++index] as ListFormat;
        if (!LIST_FORMATS.includes(options.listFiles)) {
          throw new Error(
            `--list-files must be one of ${LIST_FORMATS.join(", ")}`,
          );
        }
        break;
      case "--files": {
        // Consumes every following argument up to the next flag.
        const start = index + 1;
        while (index + 1 < argv.length && !argv[index + 1].startsWith("-")) {
          index++;
        }
        options.files = argv.slice(start, index + 1);
        break;
      }
      case "--json":
        options.json = true;
        break;
      case "--github-output":
        options.githubOutput = true;
        break;
      default:
        throw new Error(`Unknown argument "${arg}"`);
    }
  }

  return options;
}

// Outside a workflow there is no event payload, so the diff is taken against
// an explicit base instead.
function localChangeSet(base: string): ChangeSet {
  try {
    return {
      kind: "files",
      files: parseNameStatus(
        runCommand("git", ["diff", "--name-status", "-z", `${base}...HEAD`]),
      ),
    };
  } catch (error) {
    return { kind: "all", reason: `${error}` };
  }
}

function formatFiles(files: ChangedFile[], format: ListFormat): string {
  const names = files.map((file) => file.filename);
  switch (format) {
    case "csv":
      return names.join(",");
    case "json":
      return JSON.stringify(names);
    case "shell":
      return names.map((name) => `'${name.replace(/'/g, `'\\''`)}'`).join(" ");
    case "none":
      return "";
  }
}

function writeGithubOutput(result: FilterResult, format: ListFormat): void {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) {
    throw new Error("--github-output requires GITHUB_OUTPUT to be set");
  }

  const matched = new Set(result.matched);
  const lines: string[] = [];

  // In the `all` case there is no diff, so `_count` and `_files` are omitted
  // rather than written as zero/empty — a consumer that narrows its work from
  // them must see them missing, not see "nothing changed".
  const names = result.kind === "all" ? result.matched : Object.keys(result.files);

  for (const name of names) {
    lines.push(`${name}=${matched.has(name)}`);

    if (result.kind === "files") {
      lines.push(`${name}_count=${result.files[name].length}`);
      if (format !== "none") {
        lines.push(`${name}_files=${formatFiles(result.files[name], format)}`);
      }
    }
  }

  lines.push(`changes=${JSON.stringify(result.matched)}`);
  appendFileSync(path, `${lines.join("\n")}\n`);
}

function report(result: FilterResult, changes: ChangeSet): void {
  if (result.kind === "all") {
    process.stderr.write(
      `Could not determine the diff (${result.reason}).\n` +
        `Treating every filter as changed — ${result.matched.length} filters, full run.\n`,
    );
    return;
  }

  const changedCount = changes.kind === "files" ? changes.files.length : 0;
  const names = Object.keys(result.files).sort();
  const width = Math.max(...names.map((name) => name.length));

  process.stdout.write(`${changedCount} changed file(s)\n\n`);
  for (const name of names) {
    const count = result.files[name].length;
    const mark = count > 0 ? "RUN " : "skip";
    const detail = count > 0 ? ` (${count})` : "";
    process.stdout.write(`  ${mark}  ${name.padEnd(width)}${detail}\n`);
  }
  process.stdout.write(
    `\n${result.matched.length} of ${names.length} filters matched\n`,
  );
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const filters = parseFilters(readFileSync(options.filterFile, "utf8"));

  const changes = resolveChanges(options);
  const result = matchFilters(filters, changes);

  if (options.githubOutput) {
    writeGithubOutput(result, options.listFiles);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (!options.githubOutput) {
    report(result, changes);
  }
}

// Chooses the change source: an explicit file list, the workflow event, or a
// local diff against `--base`.
function resolveChanges(options: Options): ChangeSet {
  if (options.files) {
    return {
      kind: "files",
      files: options.files.map((filename) => ({
        filename,
        status: "modified" as const,
      })),
    };
  }

  if (process.env.GITHUB_EVENT_NAME) {
    return resolveChangeSet(readEventContext());
  }

  return localChangeSet(options.base);
}

main();
