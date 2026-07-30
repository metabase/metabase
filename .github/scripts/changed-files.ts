// Works out which files changed for the current event, matching how
// dorny/paths-filter sources its diff:
//   - `pull_request`: the GitHub API's file list for the PR, so no git history
//     is needed and a depth-1 checkout is enough
//   - `push` to the default branch: diff against the commit before the push
//   - `push` to any other branch: three-dot diff against the merge-base with
//     the default branch, deepening the shallow clone until it is reachable
//
// `merge_group` is deliberately absent: no merge queue is enabled, so the event
// never fires.
//
// Every failure resolves to `{ kind: "all" }` rather than an error or an empty
// list. A false skip drops a suite while still reporting green; over-running is
// the cheaper mistake.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import type { ChangeSet, ChangeStatus, ChangedFile } from "./path-filters";

const INITIAL_FETCH_DEPTH = 100;
const MAX_FETCH_DEPTH = 25_600;
const EMPTY_SHA = "0000000000000000000000000000000000000000";

export type EventContext = {
  eventName: string;
  refName: string;
  sha: string;
  before: string | null;
  defaultBranch: string;
  pullRequestNumber: number | null;
  repository: string | null;
};

export type Deps = {
  run: (command: string, args: string[]) => string;
  log: (message: string) => void;
};

const GIT_STATUS: Record<string, ChangeStatus> = {
  A: "added",
  C: "copied",
  D: "deleted",
  M: "modified",
  R: "renamed",
  U: "unmerged",
  // Deliberate divergence: dorny leaves a type change unmapped, so it matches
  // no change-type rule. A file that turns into a symlink still changed, and
  // matching more is the safe direction here.
  T: "modified",
};

// The API's vocabulary differs from git's; `changed` is what GitHub reports for
// a permission-only change.
const API_STATUS: Record<string, ChangeStatus> = {
  added: "added",
  removed: "deleted",
  modified: "modified",
  renamed: "renamed",
  copied: "copied",
  changed: "modified",
  unchanged: "unknown",
};

export const runCommand = (command: string, args: string[]): string =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

export const defaultDeps: Deps = {
  run: runCommand,
  log: (message) => process.stderr.write(`${message}\n`),
};

// `--name-status -z` emits NUL-separated records. Renames and copies carry two
// paths; the new one is what the filters should see, matching what the API
// reports for the same change.
export function parseNameStatus(output: string): ChangedFile[] {
  const tokens = output.split("\0").filter((token) => token !== "");
  const files: ChangedFile[] = [];

  for (let index = 0; index < tokens.length; ) {
    const letter = tokens[index++][0];
    const status = GIT_STATUS[letter] ?? "unknown";

    if (letter === "R" || letter === "C") {
      index++;
    }

    const filename = tokens[index++];
    if (filename !== undefined) {
      files.push({ filename, status });
    }
  }

  return files;
}

// `gh` resolves its own auth: GH_TOKEN in CI, the local login otherwise.
// `--paginate` concatenates one JSON array per page, which is not valid JSON on
// its own, so `--jq` reduces each page to one object per line.
export function listPullRequestFiles(
  context: EventContext,
  deps: Deps,
): ChangedFile[] {
  const { repository, pullRequestNumber } = context;

  if (!repository || !pullRequestNumber) {
    throw new Error("No repository or pull request number in the event");
  }

  const output = deps.run("gh", [
    "api",
    "--paginate",
    `repos/${repository}/pulls/${pullRequestNumber}/files`,
    "--jq",
    ".[] | {filename, status} | @json",
  ]);

  return output
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const { filename, status } = JSON.parse(line);
      return { filename, status: API_STATUS[status] ?? "unknown" };
    });
}

export function readEventContext(
  env: NodeJS.ProcessEnv = process.env,
): EventContext {
  const payload = readEventPayload(env.GITHUB_EVENT_PATH);

  return {
    eventName: env.GITHUB_EVENT_NAME ?? "",
    refName: env.GITHUB_REF_NAME ?? "",
    sha: env.GITHUB_SHA ?? "HEAD",
    before: typeof payload.before === "string" ? payload.before : null,
    defaultBranch:
      (payload.repository as { default_branch?: string })?.default_branch ??
      "master",
    pullRequestNumber:
      (payload.pull_request as { number?: number })?.number ?? null,
    repository: env.GITHUB_REPOSITORY ?? null,
  };
}

function readEventPayload(path: string | undefined): Record<string, unknown> {
  if (!path) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

const commitExists = (deps: Deps, sha: string): boolean => {
  try {
    deps.run("git", ["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

// A depth-1 checkout has neither the pushed-from commit nor the merge-base, so
// history is deepened until the wanted commit shows up or the cap is hit.
function deepenUntil(
  deps: Deps,
  isReachable: () => boolean,
  fetchRef: (depth: number) => void,
): boolean {
  for (let depth = INITIAL_FETCH_DEPTH; depth <= MAX_FETCH_DEPTH; depth *= 2) {
    if (isReachable()) {
      return true;
    }
    try {
      fetchRef(depth);
    } catch (error) {
      deps.log(`Fetch at depth ${depth} failed: ${error}`);
      return false;
    }
  }
  return isReachable();
}

function pushToDefaultBranch(deps: Deps, context: EventContext): ChangeSet {
  const { before, sha } = context;

  if (!before || before === EMPTY_SHA) {
    return { kind: "all", reason: "no previous commit recorded for this push" };
  }

  const reachable = deepenUntil(
    deps,
    () => commitExists(deps, before),
    (depth) =>
      deps.run("git", ["fetch", "--no-tags", `--deepen=${depth}`, "origin"]),
  );

  if (!reachable) {
    return {
      kind: "all",
      reason: `could not reach ${before.slice(0, 12)} in the fetched history`,
    };
  }

  return {
    kind: "files",
    files: parseNameStatus(
      deps.run("git", ["diff", "--name-status", "-z", before, sha]),
    ),
  };
}

function pushToOtherBranch(deps: Deps, context: EventContext): ChangeSet {
  const { defaultBranch, sha } = context;
  const remoteBase = `origin/${defaultBranch}`;

  const reachable = deepenUntil(
    deps,
    () => {
      try {
        deps.run("git", ["merge-base", remoteBase, sha]);
        return true;
      } catch {
        return false;
      }
    },
    (depth) => {
      deps.run("git", [
        "fetch",
        "--no-tags",
        `--depth=${depth}`,
        "origin",
        `+refs/heads/${defaultBranch}:refs/remotes/${remoteBase}`,
      ]);
      try {
        deps.run("git", ["fetch", "--no-tags", `--deepen=${depth}`, "origin"]);
      } catch {
        // Already a complete clone; nothing to deepen.
      }
    },
  );

  if (!reachable) {
    return {
      kind: "all",
      reason: `no merge-base found between ${remoteBase} and HEAD`,
    };
  }

  return {
    kind: "files",
    files: parseNameStatus(
      deps.run("git", ["diff", "--name-status", "-z", `${remoteBase}...${sha}`]),
    ),
  };
}

export function resolveChangeSet(
  context: EventContext,
  deps: Deps = defaultDeps,
): ChangeSet {
  try {
    if (context.eventName === "pull_request") {
      return { kind: "files", files: listPullRequestFiles(context, deps) };
    }

    if (context.eventName === "push") {
      return context.refName === context.defaultBranch
        ? pushToDefaultBranch(deps, context)
        : pushToOtherBranch(deps, context);
    }

    return {
      kind: "all",
      reason: `unhandled event "${context.eventName || "(none)"}"`,
    };
  } catch (error) {
    return { kind: "all", reason: `${error}` };
  }
}
