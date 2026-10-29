import fs from "node:fs";
import path from "node:path";

import { isTracked, unifiedDiff } from "./git.mjs";

const TEST_PATH_RE = /\.unit\.spec\.|\.cy\.spec\.|(^|\/)e2e\/|(^|\/)test\/|__support__|__mocks__|(^|\/)mocks?\/|\.stories\./;
const BACKEND_RE = /\.(clj|cljc|edn)$/;
const SCRIPT_RE = /\.(js|jsx|ts|tsx|mjs|cjs)$/;
const KINDS = new Set(["remove", "block", "wrong-value"]);

const lineAt = (text, offset) => text.slice(0, offset).split("\n").length;

export function syntaxErrors(ts, file, text) {
  const out = ts.transpileModule(text, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return (out.diagnostics || []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

// Turns each break's find-and-replace edits into whole-file contents, the changed line range and a patch.
// A break that can't be applied keeps an `unmeasured` reason and is never run.
export function prepareBreaks({ root, ts, scope, raw }) {
  const removedIds = new Set(scope.removed_tests.map((t) => t.id));
  const list = Array.isArray(raw) ? raw : raw?.breaks;
  if (!Array.isArray(list)) {
    throw new Error('the breaks file needs a "breaks" array; see README.md for the format');
  }
  return list.map((b, i) => {
    const id = String(b.id ?? i + 1);
    const base = {
      id,
      test: b.test ?? null,
      test_known: removedIds.has(b.test),
      checks: b.checks ?? null,
      assertion: typeof b.assertion === "string" ? b.assertion : null,
      description: b.break ?? b.description ?? "",
      kind: KINDS.has(b.kind) ? b.kind : null,
    };
    const fail = (reason) => ({ ...base, unmeasured: reason, changes: [], lang: null });
    if (!Array.isArray(b.edits) || b.edits.length === 0) {
      return fail("the break has no edits");
    }
    const texts = new Map();
    const ranges = new Map();
    for (const edit of b.edits) {
      const file = typeof edit.file === "string" ? path.normalize(edit.file).replace(/^\.\//, "") : null;
      if (!file || file.startsWith("..") || path.isAbsolute(file)) {
        return fail(`edit file ${JSON.stringify(edit.file)} isn't a path inside the repo`);
      }
      if (TEST_PATH_RE.test(file)) {
        return fail(`${file} is test code; breaks go in product code`);
      }
      if (!fs.existsSync(path.join(root, file)) || !isTracked(root, file)) {
        return fail(`${file} isn't a tracked file`);
      }
      if (typeof edit.find !== "string" || !edit.find || typeof edit.replace !== "string") {
        return fail(`an edit to ${file} needs non-empty "find" and a "replace" string`);
      }
      const text = texts.get(file) ?? fs.readFileSync(path.join(root, file), "utf8");
      const first = text.indexOf(edit.find);
      if (first < 0) {
        return fail(`the find text isn't in ${file}`);
      }
      if (text.indexOf(edit.find, first + 1) >= 0) {
        return fail(`the find text appears more than once in ${file}`);
      }
      if (!texts.has(file)) {
        const original = fs.readFileSync(path.join(root, file), "utf8");
        ranges.set(file, { original, lines: [] });
      }
      const original = ranges.get(file).original;
      const at = original.indexOf(edit.find);
      if (at >= 0) {
        ranges.get(file).lines.push([lineAt(original, at), lineAt(original, at + edit.find.length - 1)]);
      }
      texts.set(file, text.slice(0, first) + edit.replace + text.slice(first + edit.find.length));
    }
    const changes = [];
    for (const [file, after] of texts) {
      const { original, lines } = ranges.get(file);
      if (after === original) {
        return fail(`the edits leave ${file} unchanged`);
      }
      if (SCRIPT_RE.test(file)) {
        const errors = syntaxErrors(ts, file, after);
        if (errors.length) {
          return fail(`the break doesn't parse: ${errors[0]}`);
        }
      }
      changes.push({ file, before: original, after, lines, patch: unifiedDiff(root, file, original, after) });
    }
    const langs = new Set(changes.map((c) => (BACKEND_RE.test(c.file) ? "backend" : "frontend")));
    if (langs.size > 1) {
      return fail("the break edits frontend and backend files; split it into one break per side");
    }
    return { ...base, changes, lang: [...langs][0] };
  });
}
