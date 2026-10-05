import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function git(root, args, { allowFail = false, input } = {}) {
  const r = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 << 20,
    input,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || "").trim()}`);
  }
  return r.status === 0 ? r.stdout : null;
}

export function repoRoot(cwd) {
  return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}

export function gitDir(root) {
  return git(root, ["rev-parse", "--absolute-git-dir"]).trim();
}

export function headSha(root) {
  return git(root, ["rev-parse", "HEAD"]).trim();
}

export function branchName(root) {
  const name = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  return name === "HEAD" ? null : name;
}

export function resolveBase(root, base) {
  const candidates = base ? [base] : ["origin/master", "master"];
  for (const ref of candidates) {
    if (git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { allowFail: true })) {
      const mb = git(root, ["merge-base", "HEAD", ref], { allowFail: true });
      if (mb) {
        return { ref, mergeBase: mb.trim() };
      }
    }
  }
  throw new Error(`no merge base with ${candidates.join(" or ")}; pass --base <ref>`);
}

// Compares the merge base with the working tree, so uncommitted work on the branch counts too.
export function changedFiles(root, mergeBase) {
  const out = git(root, ["diff", "--name-status", "-M", mergeBase]);
  const rows = out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, a, b] = line.split("\t");
      const kind = status[0];
      return kind === "R" ? { status: "R", from: a, path: b } : { status: kind, from: a, path: a };
    });
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean)
    .map((p) => ({ status: "A", from: null, path: p }));
  return [...rows, ...untracked];
}

export function showAt(root, rev, file) {
  return git(root, ["show", `${rev}:${file}`], { allowFail: true });
}

export function readWorking(root, file) {
  const abs = path.join(root, file);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

export function isTracked(root, file) {
  return git(root, ["ls-files", "--error-unmatch", "--", file], { allowFail: true }) !== null;
}

export function porcelain(root, files) {
  if (!files.length) {
    return [];
  }
  return git(root, ["status", "--porcelain", "--", ...files]).split("\n").filter(Boolean);
}

export function isIgnored(root, file) {
  return git(root, ["check-ignore", "-q", "--", file], { allowFail: true }) !== null;
}

// New-side line ranges of the working tree's changes against the merge base.
export function changedLineRanges(root, mergeBase, file) {
  const out = git(root, ["diff", "-U0", mergeBase, "--", file], { allowFail: true }) ?? "";
  const ranges = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (m) {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      ranges.push([start, Math.max(start, start + count - 1)]);
    }
  }
  return ranges;
}

export function unifiedDiff(root, file, before, after) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "rc-diff-"));
  try {
    const a = path.join(dir, "a");
    const b = path.join(dir, "b");
    fs.writeFileSync(a, before);
    fs.writeFileSync(b, after);
    const r = spawnSync("git", ["diff", "--no-index", "--no-color", "-U3", a, b], { encoding: "utf8" });
    const body = r.stdout.split("\n");
    const start = body.findIndex((l) => l.startsWith("@@"));
    return [`--- a/${file}`, `+++ b/${file}`, ...body.slice(start)].join("\n").trimEnd() + "\n";
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
