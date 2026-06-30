// The shared JUnit XML parser: a JUnit `<testcase>`/`<failure>` document →
// NormalizedTest[]. Format-level and producer-agnostic — both the backend
// (hawk) and the frontend (jest-junit) adapters build on it. The per-suite
// parts (where the XML lives, how fields map, the suite label) stay in
// `adapters/`. JUnit XML is simple, machine-generated markup, so we parse it
// ourselves rather than pull in a dependency.

import type { NormalizedTest } from "./contract.ts";

/** Decode the XML entities a JUnit producer can emit in attribute values. */
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
 * Parse one JUnit XML document into normalized entries — one per `<testcase>`
 * that carries a `<failure>` or `<error>`. Multiple problems in a single
 * testcase are joined into one `stack`. Passing (self-closing or problem-free)
 * testcases are skipped. Never throws.
 *
 * Pure (string → normalized), so it's the unit-tested core that each suite's
 * adapter wraps with its own file discovery / labeling.
 */
export function parseJunit(xml: string): NormalizedTest[] {
  try {
    const tests: NormalizedTest[] = [];
    // <testcase ...>...</testcase> (failing) or <testcase .../> (passing,
    // skipped). classname carries the namespace.
    //
    // Attribute blobs are matched as a run of quoted strings or non-quote chars
    // (`ATTRS`) rather than `[^>]*`, because test names routinely contain an
    // unescaped `>` (Clojure thread arrows `cron-string->schedule-map-test`,
    // `>=`; a JS title like "renders > when open"), and XML doesn't require
    // escaping `>` inside an attribute value. A naive `[^>]` stops at that `>`
    // and silently drops the testcase (it parses with an empty name).
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
      // The `message` attribute on the failure/error is the first-class source
      // of the human-readable message. When it's absent we send null rather
      // than guessing from the body — the body's first line is the `file:line`
      // locator, not a message. The full trace stays in `stack`.
      const message =
        problems
          .map((p) => attr(p[2], "message"))
          .find((m) => m != null && m !== "") ?? null;

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
