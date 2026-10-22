import { execFileSync } from "node:child_process";

/**
 * Git-diff helpers: which e2e tests a branch deleted, and how a line number
 * at the nightly commit maps onto the working tree.
 */

export interface DeletedTest {
  spec: string;
  title: string;
}

const REMOVED_IT = /^-\s*it(?:\.skip|\.only)?\(\s*(["'`])(.*?)\1/;

export function parseDeletedTests(diff: string): DeletedTest[] {
  const deleted: DeletedTest[] = [];
  let spec = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("--- a/")) {
      spec = line.slice("--- a/".length);
      continue;
    }
    const match = line.match(REMOVED_IT);
    if (match && spec.startsWith("e2e/test/scenarios/")) {
      deleted.push({ spec, title: match[2] });
    }
  }
  return deleted;
}

export function mergeBase(repoRoot: string, base: string): string {
  return execFileSync("git", ["merge-base", base, "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

export function deletedTests(repoRoot: string, base: string): DeletedTest[] {
  const diff = execFileSync("git", ["diff", base, "--", "e2e/test/scenarios"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseDeletedTests(diff);
}

export function changedUnitSpecs(repoRoot: string, base: string): string[] {
  const out = execFileSync("git", ["diff", "--name-only", base, "--"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return out.split("\n").filter((file) => /\.unit\.spec\.[jt]sx?$/.test(file));
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newCount: number;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseHunks(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  for (const line of diff.split("\n")) {
    const match = line.match(HUNK);
    if (match) {
      hunks.push({
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
      });
    }
  }
  return hunks;
}

/**
 * Maps an old line number through the hunks. Returns null when the line sits
 * inside a changed region, so the nightly function no longer exists as it was.
 */
export function mapLine(hunks: Hunk[], line: number): number | null {
  let shift = 0;
  for (const hunk of hunks) {
    if (hunk.oldCount === 0) {
      if (line > hunk.oldStart) {
        shift += hunk.newCount;
      }
      continue;
    }
    if (line >= hunk.oldStart && line < hunk.oldStart + hunk.oldCount) {
      return null;
    }
    if (line >= hunk.oldStart + hunk.oldCount) {
      shift += hunk.newCount - hunk.oldCount;
    }
  }
  return line + shift;
}

export function lineMapper(repoRoot: string, sha: string, file: string) {
  const diff = execFileSync("git", ["diff", "-U0", sha, "--", file], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const hunks = parseHunks(diff);
  return (line: number) => mapLine(hunks, line);
}

export function fileExistsAtHead(repoRoot: string, file: string) {
  try {
    execFileSync("git", ["cat-file", "-e", `HEAD:${file}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function dirtyFiles(repoRoot: string, files: string[]): string[] {
  if (files.length === 0) {
    return [];
  }
  const out = execFileSync("git", ["status", "--porcelain", "--", ...files], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
}

export function restoreFiles(repoRoot: string, files: string[]) {
  if (files.length > 0) {
    execFileSync("git", ["checkout", "--", ...files], {
      cwd: repoRoot,
      stdio: "ignore",
    });
  }
}
