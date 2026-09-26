import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const CORPUS = "/Users/fraser/Documents/code/metabase/local/regression-corpus/overnight/july-corpus/bugs";
const WORKTREE = "/private/tmp/metabase-corpus-mutants";
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "targets.json");

const SKIP = [
  /\.unit\.spec\./,
  /\.cy\.spec\./,
  /\.spec\.[jt]sx?$/,
  /_test\.clj[cs]?$/,
  /(^|\/)test\//,
  /__snapshots__|\.snap$/,
  /\.css$/,
  /^e2e\//,
  /(^|\/)package\.json$|\.lock$/,
];

const counts = new Map();
for (const bug of fs.readdirSync(CORPUS)) {
  const files = new Set();
  for (const name of ["mutation.patch", "reconstruction.patch", "inverse.patch"]) {
    const p = path.join(CORPUS, bug, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^diff --git a\/(\S+) b\//);
      if (m) files.add(m[1]);
    }
  }
  for (const f of files) {
    if (SKIP.some((re) => re.test(f))) continue;
    if (!counts.has(f)) counts.set(f, []);
    counts.get(f).push(bug);
  }
}

const git = (cmd) => execSync(`git -C ${WORKTREE} ${cmd}`, { encoding: "utf8" }).trim();

function resolveRename(file) {
  const commit = git(`log -1 --format=%h --diff-filter=D HEAD -- ${file}`);
  if (!commit) return null;
  const line = git(`show -M --name-status --format= ${commit}`)
    .split("\n")
    .map((l) => l.split("\t"))
    .find(([status, from]) => status.startsWith("R") && from === file);
  return line ? line[2] : null;
}

const targets = [...counts.entries()]
  .map(([original, bugs]) => {
    let file = original;
    for (let hop = 0; hop < 3 && !fs.existsSync(path.join(WORKTREE, file)); hop++) {
      file = resolveRename(file) ?? file;
    }
    const tsTwin = file.replace(/\.js(x?)$/, ".ts$1");
    if (!fs.existsSync(path.join(WORKTREE, file)) && fs.existsSync(path.join(WORKTREE, tsTwin))) file = tsTwin;
    return {
      file,
      ...(file !== original && { renamed_from: original }),
      freq: bugs.length,
      bugs,
      lang: /\.(clj|cljc)$/.test(file) ? "clj" : /\.[jt]sx?$/.test(file) ? "fe" : "other",
      exists: fs.existsSync(path.join(WORKTREE, file)) && !/\.stories\./.test(file),
    };
  })
  .sort((a, b) => b.freq - a.freq || a.file.localeCompare(b.file));

fs.writeFileSync(OUT, JSON.stringify(targets, null, 1));
const by = (k) => targets.reduce((acc, t) => ((acc[t[k]] = (acc[t[k]] || 0) + 1), acc), {});
console.log({ total: targets.length, lang: by("lang"), exists: by("exists") });
