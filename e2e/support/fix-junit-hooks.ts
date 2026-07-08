#!/usr/bin/env bun

// Rewrite Cypress JUnit XML so hook failures are attributed to the
// underlying test. When a `before each` / `before all` / `after each` /
// `after all` hook throws, mocha-junit-reporter records the failing testcase
// as `<suite> "before each" hook for "<test name>"`. That breaks downstream
// Trunk that keys on the test name. This script parses the
// XML and strips the hook label from `name` and `classname`, leaving the
// failure body intact so the error is still preserved.

import {
  copyFileSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { Command } from "commander";
import XMLBuilder from "fast-xml-builder";
import { XMLParser } from "fast-xml-parser";

type Options = {
  dryRun?: boolean;
  include: string[];
};

type Testcase = {
  "@_name"?: string;
  "@_classname"?: string;
  [k: string]: unknown;
};

type Action =
  | "rewrote"
  | "dry-run"
  | "no-hooks"
  | "skipped-include"
  | "skipped-no-spec";

type Rewrite = { before: string; after: string };

type Result = {
  action: Action;
  scanned: number;
  rewritten: number;
  specFile: string | null;
  rewrites: Rewrite[];
};

console.error("fix-junit-hooks: parsing arguments");

const program = new Command();
program
  .name("fix-junit-hooks")
  .description(
    "Rewrite Mocha/Cypress JUnit XML to attribute hook failures to the underlying test.",
  )
  .argument("<input-dir>", "directory of JUnit XML files to process")
  .argument(
    "[output-dir]",
    "directory to write results to (defaults to input-dir, in place)",
  )
  .option("--dry-run", "log intended changes without writing rewritten XML")
  .option(
    "--include <substring>",
    "only rewrite when the Root Suite's spec file path contains this substring (repeatable)",
    (value: string, previous: string[]) => previous.concat([value]),
    [] as string[],
  )
  .parse();

const [inDir, outDir = inDir] = program.processedArgs as [string, string?];
const { dryRun = false, include: includes } = program.opts<Options>();

console.error(
  `fix-junit-hooks: start (in=${inDir}, out=${outDir}, dryRun=${dryRun}, includes=[${includes.join(", ")}])`,
);

if (!statSync(inDir).isDirectory()) {
  console.error(`error: <input-dir> must be a directory, got ${inDir}`);
  process.exit(1);
}
if (inDir !== outDir) {
  let outStat: ReturnType<typeof statSync> | null = null;
  try {
    outStat = statSync(outDir);
  } catch {}
  if (outStat && !outStat.isDirectory()) {
    console.error(`error: <output-dir> must be a directory, got ${outDir}`);
    process.exit(1);
  }
}

const xmlOpts = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  preserveOrder: false,
};
const parser = new XMLParser(xmlOpts);
const builder = new XMLBuilder({ ...xmlOpts, format: true });

const HOOK_RE = /"(?:before|after) (?:each|all)" hook for "([^"]+)"/g;
const fix = (s: string | undefined): string | undefined =>
  typeof s === "string" ? s.replace(HOOK_RE, "$1") : s;

function visitTestcases(node: unknown, fn: (tc: Testcase) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n) => visitTestcases(n, fn));
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "testcase") {
      (Array.isArray(v) ? v : [v]).forEach((tc: Testcase) => fn(tc));
    } else {
      visitTestcases(v, fn);
    }
  }
}

// mocha-junit-reporter records the spec path as `file=` on the Root Suite
// testsuite; that's the only place it appears in the document.
function findSpecFile(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findSpecFile(n);
      if (f) {
        return f;
      }
    }
    return null;
  }
  if (!node || typeof node !== "object") {
    return null;
  }
  const file = (node as Record<string, unknown>)["@_file"];
  if (typeof file === "string") {
    return file;
  }
  for (const v of Object.values(node)) {
    const f = findSpecFile(v);
    if (f) {
      return f;
    }
  }
  return null;
}

function passthrough(input: string, output: string): void {
  if (input !== output) {
    copyFileSync(input, output);
  }
}

function processFile(input: string, output: string): Result {
  const tree = parser.parse(readFileSync(input, "utf8"));
  const specFile = findSpecFile(tree);

  if (includes.length) {
    const matched = specFile && includes.some((s) => specFile.includes(s));
    if (!matched) {
      passthrough(input, output);
      return {
        action: specFile ? "skipped-include" : "skipped-no-spec",
        scanned: 0,
        rewritten: 0,
        specFile,
        rewrites: [],
      };
    }
  }

  let scanned = 0;
  const rewrites: Rewrite[] = [];
  visitTestcases(tree, (tc) => {
    scanned++;
    const before = tc["@_name"];
    tc["@_name"] = fix(tc["@_name"]);
    tc["@_classname"] = fix(tc["@_classname"]);
    if (
      tc["@_name"] !== before &&
      before !== undefined &&
      tc["@_name"] !== undefined
    ) {
      rewrites.push({ before, after: tc["@_name"] });
    }
  });
  const rewritten = rewrites.length;

  if (dryRun) {
    passthrough(input, output);
    return { action: "dry-run", scanned, rewritten, specFile, rewrites };
  }
  if (rewritten === 0) {
    passthrough(input, output);
    return { action: "no-hooks", scanned, rewritten, specFile, rewrites };
  }
  writeFileSync(output, builder.build(tree));
  return { action: "rewrote", scanned, rewritten, specFile, rewrites };
}

function summarize(path: string, r: Result): string {
  const head = (() => {
    switch (r.action) {
      case "rewrote":
        return `${path}: rewrote ${r.rewritten}/${r.scanned}`;
      case "dry-run":
        return `${path}: dry-run would rewrite ${r.rewritten}/${r.scanned}`;
      case "no-hooks":
        return `${path}: no hooks (0/${r.scanned})`;
      case "skipped-include":
        return `${path}: skipped (${r.specFile} did not match --include)`;
      case "skipped-no-spec":
        return `${path}: skipped (no Root Suite file= attribute)`;
    }
  })();
  if (r.rewrites.length === 0) {
    return head;
  }
  const detail = r.rewrites
    .map(({ before, after }) => `  ${before} -> ${after}`)
    .join("\n");
  return `${head}\n${detail}`;
}

const files = readdirSync(inDir)
  .filter((f) => f.endsWith(".xml"))
  .sort();

console.error(`fix-junit-hooks: found ${files.length} XML file(s)`);

let totalScanned = 0;
let totalRewritten = 0;
for (const f of files) {
  const inP = join(inDir, f);
  const outP = inDir === outDir ? inP : join(outDir, f);
  console.error(
    `fix-junit-hooks: processing ${f} (${statSync(inP).size} bytes)`,
  );
  const r = processFile(inP, outP);
  console.error(summarize(inP, r));
  totalScanned += r.scanned;
  totalRewritten += r.rewritten;
}
console.error(
  `total: ${totalRewritten}/${totalScanned} rewritten across ${files.length} files`,
);
