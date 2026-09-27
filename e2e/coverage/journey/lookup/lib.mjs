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
    baselineKeys: new Set(baseline.keys ?? everyTestBaselineKeys(baseline)),
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

// The backend baseline is the union of every shard's, so subtraction removes each of its classes from every test.
// A frontend function is removed from every test only when every shard's baseline fired it.
export function everyTestBaselineKeys(baseline) {
  return [
    ...Object.entries(baseline.frontendShards)
      .filter(([, shards]) => shards === baseline.shards)
      .map(([fn]) => `fe:${fn}`),
    ...baseline.backend.map((name) => `be:${name}`),
  ];
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
  const result = {
    kind: "frontend",
    file: loc.file,
    keys: [],
    functions: [],
    notes: [],
  };
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
  result.file = file;
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
  let result;
  if (loc.file && isJsFile(loc.file)) {
    result = resolveFrontend(index, loc, ctx);
  } else if (loc.ns || (loc.file && isCljFile(loc.file))) {
    result = resolveBackend(index, loc, ctx);
  } else {
    return {
      kind: "unknown",
      keys: [],
      notes: [`unsupported location ${JSON.stringify(loc)}`],
    };
  }
  const baseline = result.keys.filter((key) => index.baselineKeys.has(key));
  if (baseline.length > 0) {
    result.baselineKeys = baseline.length;
    result.notes.push(
      `${baseline.length} of its ${result.keys.length} keys are subtracted from every test, so every test that ${baselineReachers(baseline)} reaches them, with basis baseline`,
    );
  }
  return result;
}

function baselineReachers(keys) {
  const frontend = keys.some((key) => key.startsWith("fe:"));
  const backend = keys.some((key) => key.startsWith("be:"));
  return [
    ...(frontend ? ["loaded the app"] : []),
    ...(backend ? ["made an app request"] : []),
  ].join(" or ");
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

// Paths the server answers with something other than the app's index.html.
const PAGE_KINDS = [
  [/^\/embed(\/|$)/, "embed"],
  [/^\/public(\/|$)/, "public"],
  [/^\/(api|app|oauth|\.well-known)(\/|$)/, "other"],
];
const LOAD_KINDS = ["app", "embed", "public", "other"];

/**
 * The kind of the top-window pages a test loaded: `app` when any of them is an app page, else `embed`, `public` or `other`.
 * It's `unknown` when the index records no pages, or the test loaded none of its own.
 */
export function loadKind(pages) {
  const kinds = new Set(
    (pages ?? []).map(
      (page) => PAGE_KINDS.find(([re]) => re.test(page))?.[1] ?? "app",
    ),
  );
  return LOAD_KINDS.find((kind) => kinds.has(kind)) ?? "unknown";
}

const sortRows = (rows) =>
  rows.sort(
    (a, b) =>
      (b.assertsAfter ?? -1) - (a.assertsAfter ?? -1) ||
      a.id.localeCompare(b.id),
  );

const withAsserts = (reach) => ({
  reach,
  reachAndAssert: reach.filter((row) => (row.assertsAfter ?? 0) > 0),
});

/**
 * Tests that reach any of the keys, each with the `basis` of its reach.
 * Basis `subtraction` is measured reach after baseline subtraction,
 * and `assertsAfter` counts the passing assertions from the first step cut holding one of the keys, or is null when no step cut held them.
 * Basis `baseline` is reach inferred from appActivity() for keys that subtraction removes from every test:
 * every test that loaded the app reaches a frontend one, and every test that made an app request reaches a backend one.
 * Each baseline row has the `load` of its test, from appActivity().
 * A test that reaches the keys both ways keeps its measured row in `reach`, and `byBasis` lists it under both bases.
 */
export function query(
  index,
  keys,
  { exclude = new Set(), includeNotPassing = false } = {},
) {
  const measured = new Map();
  let baselineFrontend = false;
  let baselineBackend = false;
  for (const key of keys) {
    if (index.baselineKeys.has(key)) {
      if (key.startsWith("fe:")) {
        baselineFrontend = true;
      } else {
        baselineBackend = true;
      }
    }
    const id = index.keyIds.get(key);
    if (id === undefined) {
      continue;
    }
    const start = index.offsets[id];
    const end = start + index.lengths[id];
    for (let i = start; i < end; i += 2) {
      const testIndex = index.postings[i];
      const after = index.postings[i + 1] - 1;
      const previous = measured.get(testIndex);
      if (previous === undefined || after > previous) {
        measured.set(testIndex, after);
      }
    }
  }
  const inferred = new Map();
  if (baselineFrontend || baselineBackend) {
    appActivity(index).forEach((activity, testIndex) => {
      const after = Math.max(
        baselineFrontend && activity.loadedApp ? activity.loadAsserts : -1,
        baselineBackend && activity.madeRequest ? activity.requestAsserts : -1,
      );
      if (after >= 0) {
        inferred.set(testIndex, after);
      }
    });
  }

  const activities = inferred.size > 0 ? appActivity(index) : null;
  const byBasis = {};
  const rows = new Map();
  for (const [basis, afters] of [
    ["subtraction", measured],
    ["baseline", inferred],
  ]) {
    const reach = [];
    for (const [testIndex, after] of afters) {
      const test = index.tests[testIndex];
      if (exclude.has(test.id)) {
        continue;
      }
      const row = {
        id: test.id,
        assertsAfter: after >= 0 ? after : null,
        run: test.run,
        basis,
        ...(basis === "baseline" ? { load: activities[testIndex].load } : {}),
      };
      if (!rows.has(testIndex)) {
        rows.set(testIndex, row);
      }
      if (test.state === "passed" || includeNotPassing) {
        reach.push(row);
      }
    }
    byBasis[basis] = withAsserts(sortRows(reach));
  }
  const reach = [];
  const notPassing = [];
  for (const [testIndex, row] of rows) {
    const test = index.tests[testIndex];
    if (test.state !== "passed") {
      notPassing.push({ ...row, state: test.state });
      if (!includeNotPassing) {
        continue;
      }
    }
    reach.push(row);
  }
  return {
    ...withAsserts(sortRows(reach)),
    notPassing,
    byBasis,
    baselineKeys: new Set(keys.filter((key) => index.baselineKeys.has(key)))
      .size,
  };
}

/**
 * Per test, whether it loaded the app in the top window and whether it made an app request,
 * with `loadAsserts` and `requestAsserts`, the passing assertions from the first step cut after each.
 * For an index whose tests.json lacks them, a test loaded the app when it reached a frontend function after subtraction,
 * and made an app request when it reached a backend class or loaded the app, whose boot fetches the session properties.
 * Its assertions then count from the first step cut holding a frontend key it reached, or any key for `requestAsserts`,
 * which comes at or after the first page load, and all of them count when no cut holds one.
 * `load` is the kind of the top-window pages the test loaded, from loadKind().
 */
export function appActivity(index) {
  if (!index.appActivity) {
    const { fe, be } = keyCounts(index);
    const firstFrontend = new Int32Array(index.tests.length).fill(-1);
    const firstAny = new Int32Array(index.tests.length).fill(-1);
    index.keys.forEach((key, id) => {
      const frontend = key.startsWith("fe:");
      const start = index.offsets[id];
      for (let i = start; i < start + index.lengths[id]; i += 2) {
        const testIndex = index.postings[i];
        const after = index.postings[i + 1] - 1;
        firstAny[testIndex] = Math.max(firstAny[testIndex], after);
        if (frontend) {
          firstFrontend[testIndex] = Math.max(firstFrontend[testIndex], after);
        }
      }
    });
    index.appActivity = index.tests.map((test, testIndex) => {
      const loadedApp = test.loadedApp ?? fe[testIndex] > 0;
      const madeRequest = test.madeRequest ?? (be[testIndex] > 0 || loadedApp);
      const placed = (recorded, first) =>
        recorded ?? (first[testIndex] >= 0 ? first[testIndex] : test.asserts);
      return {
        loadedApp,
        madeRequest,
        load: loadKind(test.pages),
        loadAsserts: loadedApp ? placed(test.loadAsserts, firstFrontend) : null,
        requestAsserts: madeRequest
          ? placed(test.requestAsserts, firstAny)
          : null,
      };
    });
  }
  return index.appActivity;
}

/** For each of the tests in the index, the ids of the keys it reached after baseline subtraction. */
export function keysReachedBy(index, testIds) {
  const testIndexOf = new Map(index.tests.map((test, i) => [test.id, i]));
  const wanted = new Map(
    testIds
      .filter((id) => testIndexOf.has(id))
      .map((id) => [testIndexOf.get(id), []]),
  );
  index.keys.forEach((_, keyId) => {
    const start = index.offsets[keyId];
    for (let i = start; i < start + index.lengths[keyId]; i += 2) {
      wanted.get(index.postings[i])?.push(keyId);
    }
  });
  return new Map(
    [...wanted].map(([testIndex, keys]) => [index.tests[testIndex].id, keys]),
  );
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
