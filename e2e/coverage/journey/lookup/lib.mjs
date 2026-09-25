// Loads a reach index and answers location queries against it.
import fs from "node:fs";
import path from "node:path";

import {
  enclosingCljForm,
  enclosingJsFunction,
  fnmapIndexFor,
  gitShow,
  isCljFile,
  isJsFile,
  listCljForms,
  listJsFunctions,
  munge,
  nsClassPrefix,
  nsOfCljFile,
} from "./source.mjs";

export function loadIndex(dir) {
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  const meta = read("meta.json");
  const { keys, offsets, lengths } = read("keys.json");
  const raw = fs.readFileSync(path.join(dir, "postings.bin"));
  const postings = new Uint32Array(
    raw.buffer,
    raw.byteOffset,
    raw.byteLength / 4,
  );
  const baseline = read("baseline.json");
  const optional = (name) =>
    fs.existsSync(path.join(dir, name)) ? read(name) : null;
  const index = {
    dir,
    meta,
    tests: read("tests.json"),
    keys,
    keyIds: new Map(keys.map((key, id) => [key, id])),
    offsets,
    lengths,
    postings,
    fnmap: read("fnmap.json"),
    backendBaseline: new Set(baseline.backend),
    frontendBaselineShards: baseline.frontendShards,
    baselineShardCount: baseline.shards,
    classes: optional("classes.json"),
    lines: optional("lines.json"),
    cljsOrigins: optional("cljs-origins.json"),
  };
  index.keyCounts = null;
  index.backendKeysByNs = new Map();
  const allClasses =
    index.classes ??
    keys.filter((k) => k.startsWith("be:")).map((k) => k.slice(3));
  for (const name of allClasses) {
    const prefix = name.split("$")[0];
    const list = index.backendKeysByNs.get(prefix) ?? [];
    list.push(name);
    index.backendKeysByNs.set(prefix, list);
  }
  return index;
}

/**
 * Parses a location given on the command line:
 *   <file>#<function name>, <file>:<line>, <namespace>/<var>, <file>, or a JSON object.
 */
export function parseLocation(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const hash = trimmed.lastIndexOf("#");
  if (hash > 0 && /\.\w+$/.test(trimmed.slice(0, hash))) {
    return { file: trimmed.slice(0, hash), fn: trimmed.slice(hash + 1) };
  }
  const lineMatch = trimmed.match(/^(.+\.\w+):(\d+)$/);
  if (lineMatch) {
    return { file: lineMatch[1], line: Number(lineMatch[2]) };
  }
  const slash = trimmed.indexOf("/");
  if (slash > 0 && trimmed.slice(0, slash).includes(".")) {
    return { ns: trimmed.slice(0, slash), var: trimmed.slice(slash + 1) };
  }
  if (/\.\w+$/.test(trimmed)) {
    return { file: trimmed };
  }
  throw new Error(`Can't parse location: ${text}`);
}

const isWholeFile = (loc) =>
  loc.fn == null && loc.line == null && loc.var == null;

function sourceAt(ctx, file) {
  ctx.sourceCache ??= new Map();
  if (!ctx.sourceCache.has(file)) {
    ctx.sourceCache.set(file, gitShow(ctx.repo, ctx.sha, file));
  }
  return ctx.sourceCache.get(file);
}

function nsSourceFile(ctx, ns) {
  const munged = ns.replace(/-/g, "_").replace(/\./g, "/");
  const roots = ns.startsWith("metabase-enterprise.")
    ? ["enterprise/backend/src/"]
    : ["src/"];
  for (const root of roots) {
    for (const ext of [".clj", ".cljc"]) {
      const file = `${root}${munged}${ext}`;
      if (sourceAt(ctx, file) != null) {
        return file;
      }
    }
  }
  return null;
}

function resolveFrontend(index, loc, ctx) {
  const result = { kind: "frontend", keys: [], functions: [], notes: [] };
  const fileFnmap = index.fnmap[loc.file];
  if (!fileFnmap) {
    result.notes.push(
      "file is not in the frontend coverage: no test loaded it, or it isn't instrumented",
    );
    return result;
  }
  if (isWholeFile(loc)) {
    result.via = "whole file";
    for (const [fnIndex, entry] of Object.entries(fileFnmap)) {
      result.keys.push(`fe:${loc.file}#${fnIndex}`);
      result.functions.push({
        fnIndex: Number(fnIndex),
        name: entry.name,
        line: entry.line,
        column: entry.column,
        via: "whole file",
      });
    }
    return result;
  }
  const add = (fnIndex, why) => {
    const entry = fileFnmap[fnIndex];
    const shards = index.frontendBaselineShards[`${loc.file}#${fnIndex}`] ?? 0;
    if (shards > 0 && why !== "source position") {
      result.notes.push(
        `${entry.name} fired in the coverage baseline of ${shards} of ${index.baselineShardCount} shards, so it is subtracted from those shards' tests`,
      );
      result.inBaseline = shards === index.baselineShardCount;
    }
    result.keys.push(`fe:${loc.file}#${fnIndex}`);
    result.functions.push({
      fnIndex: Number(fnIndex),
      name: entry.name,
      line: entry.line,
      column: entry.column,
      via: why,
    });
  };
  if (loc.line != null && loc.column != null) {
    const hit = Object.entries(fileFnmap).find(
      ([, e]) => e.line === loc.line && e.column === loc.column,
    );
    if (hit) {
      add(hit[0], "position");
      return result;
    }
  }
  if (loc.fn) {
    let named = Object.entries(fileFnmap).filter(([, e]) => e.name === loc.fn);
    if (named.length > 1 && loc.line != null) {
      named = [
        named.sort(
          ([, a], [, b]) =>
            Math.abs(a.line - loc.line) - Math.abs(b.line - loc.line),
        )[0],
      ];
    }
    if (named.length > 0) {
      named.forEach(([i]) => add(i, "fnmap name"));
      return result;
    }
  }
  const source = sourceAt(ctx, loc.file);
  if (source == null) {
    result.notes.push(`can't read ${loc.file} at ${ctx.sha}`);
    return result;
  }
  const functions = listJsFunctions(ctx.repo, loc.file, source);
  let targets = [];
  if (loc.fn) {
    targets = functions.filter(
      (fn) => fn.name === loc.fn || fn.display === loc.fn,
    );
    if (targets.length > 1 && loc.line != null) {
      targets = [
        targets.sort(
          (a, b) => Math.abs(a.line - loc.line) - Math.abs(b.line - loc.line),
        )[0],
      ];
    }
  }
  if (targets.length === 0 && loc.line != null) {
    // The outermost function that starts on the given line, else the innermost one around it.
    const starting = functions.filter(
      (fn) => fn.line === loc.line || fn.startLine === loc.line,
    );
    if (starting.length > 0) {
      targets = [
        starting.sort(
          (a, b) => b.endLine - b.startLine - (a.endLine - a.startLine),
        )[0],
      ];
    }
  }
  if (targets.length === 0 && loc.line != null) {
    const fn = enclosingJsFunction(functions, loc.line);
    if (fn) {
      targets = [fn];
    } else {
      result.notes.push(
        `line ${loc.line} is module-level code, which runs when the file loads`,
      );
    }
  }
  for (const target of targets) {
    let fn = target;
    let fnIndex = fnmapIndexFor(fileFnmap, fn);
    // Some inner functions have no counter in the build, so the nearest instrumented enclosing function stands in.
    while (fnIndex == null && fn.outer) {
      fn = fn.outer;
      fnIndex = fnmapIndexFor(fileFnmap, fn);
      if (fnIndex != null) {
        result.notes.push(
          `${target.display} has no function counter, so its enclosing ${fn.display} stands in`,
        );
      }
    }
    if (fnIndex != null) {
      const shards =
        index.frontendBaselineShards[`${loc.file}#${fnIndex}`] ?? 0;
      if (shards > 0) {
        result.notes.push(
          `${fn.display} fired in the coverage baseline of ${shards} of ${index.baselineShardCount} shards, so it is subtracted from those shards' tests`,
        );
        result.inBaseline = shards === index.baselineShardCount;
      }
    }
    if (fnIndex == null) {
      result.notes.push(
        `no fnmap entry at ${target.line}:${target.column} for ${target.display}`,
      );
    } else {
      add(fnIndex, "source position");
    }
  }
  if (loc.fn && targets.length === 0 && loc.line == null) {
    result.notes.push(`no function named ${loc.fn} in ${loc.file}`);
  }
  return result;
}

function endpointToken(method, route) {
  const name = `${method.replace(/^:/, "")}-${route}--thunk`
    .replace(/\//g, "-")
    .replace(/ /g, "-")
    .replace(/:/g, "");
  return munge(name);
}

function resolveBackend(index, loc, ctx) {
  const result = { kind: "backend", keys: [], classes: [], notes: [] };
  let { ns } = loc;
  let file = loc.file ?? null;
  let form = null;
  if (file && loc.line != null) {
    const source = sourceAt(ctx, file);
    if (source == null) {
      result.notes.push(`can't read ${file} at ${ctx.sha}`);
      return result;
    }
    ns ??= nsOfCljFile(source);
    form = enclosingCljForm(listCljForms(source), loc.line);
    if (!form) {
      result.notes.push(`line ${loc.line} is outside any top-level form`);
      return result;
    }
  } else if (ns && loc.line != null) {
    file = nsSourceFile(ctx, ns);
    const source = file && sourceAt(ctx, file);
    form = source ? enclosingCljForm(listCljForms(source), loc.line) : null;
  } else if (ns && loc.var) {
    file = nsSourceFile(ctx, ns);
    const source = file && sourceAt(ctx, file);
    form = source
      ? (listCljForms(source).find((f) => {
          const h = f.head;
          return (
            (h.kind === "def" && h.name === loc.var) ||
            (h.kind === "defmethod" &&
              `${h.multi} ${h.dispatch}` === loc.var) ||
            (h.kind === "endpoint" && `${h.method} ${h.route}` === loc.var)
          );
        }) ?? null)
      : null;
  } else if (file && isWholeFile(loc)) {
    const source = sourceAt(ctx, file);
    if (source == null) {
      result.notes.push(`can't read ${file} at ${ctx.sha}`);
      return result;
    }
    ns ??= nsOfCljFile(source);
  } else if (ns && isWholeFile(loc)) {
    file = nsSourceFile(ctx, ns);
  }
  if (!ns) {
    result.notes.push("no namespace");
    return result;
  }
  const prefix = nsClassPrefix(ns);
  const nsClasses = index.backendKeysByNs.get(prefix) ?? [];
  if (nsClasses.length === 0) {
    result.notes.push(`no class of ${ns} was loaded in any test`);
  }
  let names = [];
  if (isWholeFile(loc)) {
    names = namespaceClasses(index, prefix);
    result.via = "whole namespace";
  }
  const head =
    form?.head ??
    (loc.var ? { kind: loc.kind ?? "def", name: loc.var, ...loc } : null);
  if (form && index.lines) {
    // With class line tables, a top-level form owns every class whose lines sit inside it.
    const base = path.basename(file);
    names = nsClasses.filter((name) => {
      const entry = index.lines[name];
      return (
        entry &&
        entry[0] === base &&
        !name.endsWith("__init") &&
        entry[1] >= form.startLine &&
        entry[2] <= form.endLine
      );
    });
    result.via = "line table";
  }
  if (names.length === 0 && head) {
    if (head.kind === "def" && head.name) {
      const own = `${prefix}$${munge(head.name)}`;
      names = nsClasses.filter(
        (name) => name === own || name.startsWith(`${own}$`),
      );
      result.via = "var name";
    } else if (head.kind === "endpoint" && head.method && head.route) {
      const token = endpointToken(head.method, head.route);
      const re = new RegExp(
        `^${escapeRe(prefix)}\\$(fn__\\d+)\\$${escapeRe(token)}__\\d+$`,
      );
      const owners = new Set(
        nsClasses.map((name) => name.match(re)?.[1]).filter(Boolean),
      );
      names = nsClasses.filter((name) =>
        [...owners].some(
          (owner) =>
            name === `${prefix}$${owner}` ||
            name.startsWith(`${prefix}$${owner}$`),
        ),
      );
      result.via = "endpoint thunk name";
    } else if (head.kind === "defmethod") {
      result.notes.push(
        `defmethod ${head.multi} ${head.dispatch} compiles to an anonymous class, which needs the class line tables`,
      );
    } else {
      result.notes.push(
        `top-level form ${head.op ?? "?"} has no var to match by name`,
      );
    }
  }
  result.form = form
    ? { startLine: form.startLine, endLine: form.endLine, ...form.head }
    : null;
  // The browser copy of a .cljc form or file: every cljs function whose source map origin lies inside it.
  if (
    file?.endsWith(".cljc") &&
    (form || isWholeFile(loc)) &&
    index.cljsOrigins
  ) {
    const relative = file.replace(/^(enterprise\/backend\/)?src\//, "");
    result.cljsFunctions = Object.entries(index.cljsOrigins)
      .filter(
        ([, [source, line]]) =>
          source === relative &&
          (!form || (line >= form.startLine && line <= form.endLine)),
      )
      .map(([key]) => key);
    for (const key of result.cljsFunctions) {
      result.keys.push(`fe:${key}`);
    }
    if (result.cljsFunctions.length === 0) {
      result.notes.push(
        `no function of the browser copy maps back to this ${form ? "form" : "file"}`,
      );
    }
  }
  result.ns = ns;
  for (const name of names) {
    result.classes.push(name);
    result.keys.push(`be:${name}`);
  }
  if (
    names.length > 0 &&
    names.every((name) => index.backendBaseline.has(name))
  ) {
    result.notes.push(
      "every class of this location is in the coverage baseline, so it is subtracted from every test",
    );
    result.inBaseline = true;
  }
  return result;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Namespace loaders end in "__init", and deftype, defrecord and proxy classes sit in the namespace's package.
function namespaceClasses(index, prefix) {
  const names = [
    ...(index.backendKeysByNs.get(prefix) ?? []),
    ...(index.backendKeysByNs.get(`${prefix}__init`) ?? []),
  ];
  for (const [owner, list] of index.backendKeysByNs) {
    const rest = owner.startsWith(`${prefix}/`)
      ? owner.slice(prefix.length + 1)
      : null;
    if (rest && /^([A-Z][^/]*|proxy)$/.test(rest)) {
      names.push(...list);
    }
  }
  return names;
}

export function resolveLocation(index, loc, ctx) {
  if (loc.file && isJsFile(loc.file)) {
    return resolveFrontend(index, loc, ctx);
  }
  if (loc.ns || (loc.file && isCljFile(loc.file))) {
    return resolveBackend(index, loc, ctx);
  }
  return {
    kind: "unknown",
    keys: [],
    notes: [`unsupported location ${JSON.stringify(loc)}`],
  };
}

export function describeResolved(r) {
  if (r.kind === "frontend") {
    return r.via
      ? `${r.functions.length} functions by ${r.via}`
      : r.functions.map((f) => `${f.name}@${f.line}:${f.column}`).join(", ");
  }
  if (r.kind === "backend") {
    return (
      `${r.classes.length} classes${r.via ? ` by ${r.via}` : ""}` +
      (r.cljsFunctions ? `, ${r.cljsFunctions.length} browser functions` : "")
    );
  }
  return "";
}

/**
 * Tests that reach any of the keys.
 * For each test, `assertsAfter` counts the passing assertions from the first step cut holding one of the keys,
 * or is null when no step cut held them.
 */
export function query(
  index,
  keys,
  { exclude = new Set(), includeNotPassing = false } = {},
) {
  const best = new Map();
  for (const key of keys) {
    const id = index.keyIds.get(key);
    if (id === undefined) {
      continue;
    }
    const start = index.offsets[id];
    const end = start + index.lengths[id];
    for (let i = start; i < end; i += 2) {
      const testIndex = index.postings[i];
      const after = index.postings[i + 1] - 1;
      const previous = best.get(testIndex);
      if (previous === undefined || after > previous) {
        best.set(testIndex, after);
      }
    }
  }
  const reach = [];
  const notPassing = [];
  for (const [testIndex, after] of best) {
    const test = index.tests[testIndex];
    if (exclude.has(test.id)) {
      continue;
    }
    const row = {
      id: test.id,
      assertsAfter: after >= 0 ? after : null,
      run: test.run,
    };
    if (test.state !== "passed") {
      notPassing.push({ ...row, state: test.state });
      if (!includeNotPassing) {
        continue;
      }
    }
    reach.push(row);
  }
  reach.sort(
    (a, b) =>
      (b.assertsAfter ?? -1) - (a.assertsAfter ?? -1) ||
      a.id.localeCompare(b.id),
  );
  return {
    reach,
    reachAndAssert: reach.filter((row) => (row.assertsAfter ?? 0) > 0),
    notPassing,
  };
}

/** Frontend functions and backend classes each test reached after baseline subtraction. */
export function keyCounts(index) {
  if (!index.keyCounts) {
    const fe = new Uint32Array(index.tests.length);
    const be = new Uint32Array(index.tests.length);
    index.keys.forEach((key, id) => {
      const target = key.startsWith("fe:") ? fe : be;
      const start = index.offsets[id];
      for (let i = start; i < start + index.lengths[id]; i += 2) {
        target[index.postings[i]] += 1;
      }
    });
    index.keyCounts = { fe, be };
  }
  return index.keyCounts;
}
