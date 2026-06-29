// Backend (Clojure) adapter: hawk's JUnit XML → CanonicalTest[].
//
// The hawk test runner always writes JUnit XML to `target/junit/`, so the
// backend "collector" is a post-run parse of that artifact (one runner, one
// artifact, covers both the backend and driver CI paths). hawk's output is
// simple, machine-generated XML, so we parse it ourselves rather than pull in a
// dependency.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { CanonicalTest } from "../contract.ts";
import { log } from "../log.ts";

const JUNIT_DIR = process.env.JUNIT_DIR || "target/junit";

/** Decode the XML entities hawk can emit in attribute values. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Read an attribute off an XML open-tag's attribute string. */
function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return match ? decodeEntities(match[1]) : undefined;
}

/** Unwrap CDATA / decode plain text from a failure/error body. */
function elementBody(inner: string): string {
  const cdata = [...inner.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) =>
    m[1].trim(),
  );
  const text = cdata.length > 0 ? cdata.join("\n") : decodeEntities(inner);
  return text.trim();
}

/**
 * Parse one JUnit XML document into canonical entries — one per `<testcase>`
 * that carries a `<failure>` or `<error>`. Multiple problems in a single
 * testcase are joined into one `stack`. Passing (self-closing or problem-free)
 * testcases are skipped. Never throws.
 */
export function parseJunit(xml: string): CanonicalTest[] {
  try {
    const tests: CanonicalTest[] = [];
    // Machine-generated hawk output: <testcase ...>...</testcase> (failing) or
    // <testcase .../> (passing, skipped). classname carries the namespace.
    //
    // Attribute blobs are matched as a run of quoted strings or non-quote chars
    // (`ATTRS`) rather than `[^>]*`, because Clojure test names routinely contain
    // an unescaped `>` (e.g. `cron-string->schedule-map-test`, `>=`), and XML
    // doesn't require escaping `>` inside an attribute value. A naive `[^>]` stops
    // at that `>` and silently drops the testcase (it parses with an empty name).
    const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
    const testcaseRe = new RegExp(
      `<testcase\\b(${ATTRS}?)(?:/>|>([\\s\\S]*?)</testcase>)`,
      "g",
    );
    const problemRe = new RegExp(
      `<(failure|error)\\b(${ATTRS})>([\\s\\S]*?)</\\1>`,
      "g",
    );
    for (const match of xml.matchAll(testcaseRe)) {
      const attrs = match[1];
      const inner = match[2];
      if (!inner) {
        continue; // self-closing => passed
      }

      const problems = [...inner.matchAll(problemRe)];
      if (problems.length === 0) {
        continue;
      }

      const name = (attr(attrs, "name") || "").trim();
      if (name === "") {
        continue;
      }
      const namespace = (attr(attrs, "classname") || "").trim();

      const stack = problems
        .map((p) => elementBody(p[3]))
        .filter((body) => body !== "")
        .join("\n\n");
      const lines = stack.split("\n").filter((line) => line.trim() !== "");
      // Prefer a `message` attribute on the failure/error; otherwise the first
      // line of the body (the `file:line` locator). The full trace, including
      // that line, stays in `stack`.
      const attrMessage = problems
        .map((p) => attr(p[2], "message"))
        .find((m) => m != null && m !== "");
      const message = attrMessage ?? lines[0] ?? undefined;

      tests.push({
        name,
        path: namespace || undefined,
        // file_path is unstable for backend tests (the stack locator varies by
        // failure mode), so identity is (test_suite, test_path, test_name) and
        // file is sent as null.
        file: null,
        message,
        stack: stack || undefined,
        // JUnit only tells us a test failed/errored, never that it recovered,
        // so everything is "failure".
        status: "failure",
      });
    }
    return tests;
  } catch (error) {
    console.error("[ci-conductor] failed to parse JUnit XML", error);
    return [];
  }
}

/** Recursively list `*_test.xml` files under `dir`. Returns [] on any error. */
function findJunitFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith("_test.xml"))
      .map((entry) => join(dir, entry));
  } catch {
    return [];
  }
}

/** Parse every JUnit file under `dir` into canonical entries. */
export function collectFailures(dir: string = JUNIT_DIR): CanonicalTest[] {
  const files = findJunitFiles(dir);
  const failures = files.flatMap((file) => {
    try {
      return parseJunit(readFileSync(file, "utf8"));
    } catch (error) {
      console.error(`[ci-conductor] failed to read ${file}`, error);
      return [];
    }
  });
  log(
    `scanned ${dir}: ${files.length} JUnit file(s), ${failures.length} failing test(s)`,
  );
  for (const test of failures) {
    log(`  failing: ${test.path || "(no namespace)"} / ${test.name}`);
  }
  return failures;
}
