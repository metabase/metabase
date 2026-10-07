/* eslint-disable */
// node:test harness spike. Loaded with --require. It gives Node what jest's
// config gives jest: the swc transform (lazy CommonJS), the module name
// mapping, a jsdom global, and the jest globals on top of node:test.
// jest sets both. Test support and app code branch on them.
process.env.NODE_ENV = "test";
process.env.JEST_WORKER_ID ??= "1";

const fs = require("node:fs");
const path = require("node:path");
const { registerHooks } = require("node:module");
const { pathToFileURL, fileURLToPath } = require("node:url");

// Persist V8 bytecode across runs and across the pool's processes, which each
// otherwise recompile every module they touch.
if (process.env.NT_COMPILE_CACHE === "1") {
  try {
    const { enableCompileCache } = require("node:module");
    enableCompileCache?.(path.join(__dirname, "../node_modules/.cache/node-test-spike-v8"));
  } catch {}
}

const root = path.resolve(__dirname, "..");
const abs = (p) => path.join(root, p);
const bunModule = (name) => {
  const dir = fs.readdirSync(abs("node_modules/.bun")).find((d) => d.startsWith(name.replace("/", "+") + "@"));
  return abs(`node_modules/.bun/${dir}/node_modules/${name}`);
};

// --- transform ---------------------------------------------------------------
const swc = require("@swc/core");
const cacheDir = abs("node_modules/.cache/node-test-spike");
fs.mkdirSync(cacheDir, { recursive: true });
const crypto = require("node:crypto");
// Keyed on content, not mtime, so the cache survives a fresh checkout. TRANSFORM_VERSION
// stands in for the options below: bump it whenever they change.
const TRANSFORM_VERSION = "1";
// Within one process a file cannot change, so the transformed output is held in
// memory: isolated mode re-requires modules constantly and would otherwise
// re-read and re-hash every source each time.
const transformMemo = new Map();
// A module-level `let` is state that a shared registry carries from one spec
// file into the next: a basename a test set, a lazily built singleton. Each
// module reports its own bindings once its body has run, and the harness puts
// those values back between files. Containers are left alone, because other
// modules fill them at import time and would not run again to refill them.
const TOP_LEVEL_LET = /^(?:export )?let ([A-Za-z_$][\w$]*)\s*(?::[^=;,]*)?(?:=[^,]*)?;?$/gm;
// The SDK fills these four through `_.once(registerVisualizations)`. That flag
// lives in a closure and cannot be reset, so the registration never runs twice
// in a process, and what it wrote has to stay.
const REGISTERED_ONCE = /\/(viz-core\/lib\/(registry|settings)|viz-core\/echarts\/tooltip\/index|value-formatting\/registry)\.tsx?$/;
const letTracker = (file, source) => {
  if (process.env.NT_NO_LET_RESET || /\.(spec|test)\./.test(file) || REGISTERED_ONCE.test(file)) return "";
  const names = [...source.matchAll(TOP_LEVEL_LET)].map((match) => match[1]);
  if (names.length === 0) return "";
  const list = names.join(", ");
  return `\n;globalThis.__nodeTestSpike?.trackLets?.(__filename, () => [${list}], (__values) => { [${list}] = __values; });\n`;
};
// Measurement only: module-level containers and instances, to count how many
// spec files leave module state changed.
const TOP_LEVEL_CONTAINER = /^(?:export )?const ([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:new\s+[A-Za-z_$]|\[|\{)/gm;
const constTracker = (file, source) => {
  if (!process.env.NT_MEASURE_DIRTY || /\.(spec|test)\.|\/test\/|__support__|\/mocks?\//.test(file)) return "";
  const names = [...new Set([...source.matchAll(TOP_LEVEL_CONTAINER)].map((match) => match[1]))];
  if (names.length === 0) return "";
  return `\n;globalThis.__nodeTestSpike?.trackConsts?.(__filename, ${JSON.stringify(names)}, () => [${names.map((name) => `typeof ${name} === "undefined" ? undefined : ${name}`).join(", ")}]);\n`;
};
const transformCached = (file) => {
  const source = fs.readFileSync(file, "utf8");
  return transformSource(file, source) + letTracker(file, source) + constTracker(file, source);
};
const transform = (file) => {
  const memoized = transformMemo.get(file);
  if (memoized !== undefined) return memoized;
  const code = transformCached(file);
  transformMemo.set(file, code);
  return code;
};
const transformSource = (file, source) => {
  const key =
    crypto
      .createHash("sha1")
      .update(TRANSFORM_VERSION)
      .update("\0")
      .update(file)
      .update("\0")
      .update(source)
      .digest("hex") + ".js";
  const cached = path.join(cacheDir, key);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");
  const { code } = swc.transformSync(source, {
    filename: file,
    sourceMaps: false,
    jsc: {
      target: "es2022",
      loose: true,
      parser: /\.tsx?$/.test(file) ? { syntax: "typescript", tsx: file.endsWith(".tsx") } : { syntax: "ecmascript", jsx: true },
      transform: { react: { runtime: "automatic" }, hidden: { jest: true } },
      experimental: { plugins: [["@swc-contrib/mut-cjs-exports", {}], ["@swc/plugin-emotion", { sourceMap: false }]] },
    },
    module: { type: "commonjs", lazy: true },
  });
  // Several harness processes share this cache: write, then rename into place.
  const temporary = `${cached}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, code);
  fs.renameSync(temporary, cached);
  return code;
};

// --- resolution ----------------------------------------------------------------
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json"];
const findFile = (base) => {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (fs.existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) if (fs.existsSync(path.join(base, "index" + ext))) return path.join(base, "index" + ext);
  return null;
};
const sourceRoots = ["frontend/src", "frontend/test", "enterprise/frontend/src"].map(abs);
const topLevel = new Set(sourceRoots.flatMap((dir) => fs.readdirSync(dir)));
const processDir = path.join(cacheDir, `process-${process.pid}`);
fs.mkdirSync(processDir, { recursive: true });
// A spec can emit "exit" on a live process, and the stubs must outlive that.
// Under the pool the parent removes this directory once the worker is gone.
if (process.env.NT_QUEUE !== "1") process.on("exit", () => fs.rmSync(processDir, { recursive: true, force: true }));
const stub = (name, source) => { const file = path.join(processDir, name); fs.writeFileSync(file, source); return file; };
const styleStub = stub("style-stub.cjs", "module.exports = {};");
const fileStub = stub("file-stub.cjs", 'module.exports = "test-file-stub";');
const mapped = [
  [/\.(css|less)$/, () => styleStub],
  [/\.svg\?(component|source)$/, () => abs("frontend/test/__mocks__/svgMock.tsx")],
  [/\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$/, () => fileStub],
  [/^cljs\/(.*)$/, (m) => findFile(abs(`target/cljs_dev/${m[1]}`))],
  [/^locales\/(.*)\.json$/, (m) => abs(`frontend/test/__mocks__/locales/${m[1]}.json`)],
  [/^csv-parse\/browser\/esm\/sync$/, () => abs("node_modules/csv-parse/dist/cjs/sync.cjs")],
  [/^csv-stringify\/browser\/esm\/sync$/, () => abs("node_modules/csv-stringify/dist/cjs/sync.cjs")],
  [/^sdk-ee-plugins$/, () => abs("frontend/src/metabase/plugins/noop.ts")],
  [/^(sdk-iframe-embedding-ee-plugins|sdk-iframe-embedding-script-ee-plugins|ee-plugins|ee-overrides)$/, () => abs("frontend/src/metabase/utils/noop.ts")],
  [/^docs\/embedding\/sdk\/snippets\//, () => fileStub],
  [/^docs\/(.*)$/, (m) => abs(`docs/${m[1]}`)],
  [/^build-configs\/(.*)$/, (m) => findFile(abs(`frontend/build/${m[1]}`))],
  [/^jose$/, () => abs("node_modules/jose/dist/node/cjs/index.js")],
  [/^remend$/, () => abs("node_modules/remend/dist/index.js")],
];
const resolveCache = new Map();
const resolveProject = (specifier, parentFile) => {
  for (const [pattern, target] of mapped) {
    const match = specifier.match(pattern);
    if (match) return target(match);
  }
  if (specifier.startsWith(".") && parentFile && !parentFile.includes("/node_modules/")) {
    return findFile(path.resolve(path.dirname(parentFile), specifier));
  }
  const first = specifier.split("/")[0];
  if (topLevel.has(first)) {
    if (!resolveCache.has(specifier)) {
      let found = null;
      for (const dir of sourceRoots) { found = findFile(path.join(dir, specifier)); if (found) break; }
      resolveCache.set(specifier, found);
    }
    return resolveCache.get(specifier);
  }
  return null;
};

// --- jest.mock ----------------------------------------------------------------
const mocks = new Map();
let bypassMocks = 0;
const state = { mocks, mockExports: new Map() };
globalThis.__nodeTestSpike = {
  debugMocks: () => [...mocks.keys()].filter((key) => key.startsWith("node:")).map((key) => [key, Object.keys(state.mockExports.get(key) ?? {}).length, String(mocks.get(key)).slice(0, 120)]),
  mockExports(file) {
    if (!state.mockExports.has(file)) {
      state.mockExports.set(file, mocks.get(file)());
      if (process.env.NT_DEBUG_MOCK_SHAPE && file.includes(process.env.NT_DEBUG_MOCK_SHAPE)) {
        const made = state.mockExports.get(file);
        console.error(`[mock-shape] ${file.replace(root, "")} keys=${Object.keys(made ?? {}).length} undefinedKeys=${Object.keys(made ?? {}).filter((key) => made[key] === undefined).length}\n    ${String(new Error().stack).split("\n").slice(2, 14).map((l) => l.trim().replace(root, "").replace(/.*node_modules\//, "nm/")).filter((l) => !l.includes("node:internal")).join("\n    ")}`);
      }
    }
    return state.mockExports.get(file);
  },
};

// A mock lives in a stub file of its own. Node caches a module under its file
// path, so a mock served under the real path would shadow the real module for
// jest.requireActual.
const mockStubs = new Map();
const mockStub = (file) => {
  if (!mockStubs.has(file)) {
    const stubFile = path.join(processDir, `mock-${crypto.createHash("sha1").update(file).digest("hex")}.cjs`);
    fs.writeFileSync(stubFile, `module.exports = globalThis.__nodeTestSpike.mockExports(${JSON.stringify(file)});\n`);
    mockStubs.set(file, stubFile);
  }
  return mockStubs.get(file);
};

const isProjectSource = (file) =>
  /\.(tsx?|jsx?)$/.test(file) && !file.includes("/node_modules/") && !file.includes("/target/cljs_dev/") && !file.startsWith(cacheDir) &&
  (file.startsWith(abs("frontend/")) || file.startsWith(abs("enterprise/frontend/")) || file.startsWith(abs("e2e/support/")) || file.startsWith(abs("node-test-spike/")));

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parentFile = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL.split("?")[0]) : undefined;
    if (process.env.NT_DEBUG && specifier.startsWith(".")) console.error("[resolve]", specifier, "parentURL=", context.parentURL, "->", parentFile && resolveProject(specifier, parentFile));
    const projectFile = specifier.startsWith("file:") || specifier.startsWith("node:") ? null : resolveProject(specifier, parentFile);
    const result = projectFile ? { url: pathToFileURL(projectFile).href, shortCircuit: true } : nextResolve(specifier, context);
    if (!bypassMocks && result.url.startsWith("node:") && mocks.has(result.url)) {
      return { url: pathToFileURL(mockStub(result.url)).href, format: "commonjs", shortCircuit: true };
    }
    if (!bypassMocks && result.url.startsWith("file:")) {
      const file = fileURLToPath(result.url.split("?")[0]);
      if (mocks.has(file)) return { url: pathToFileURL(mockStub(file)).href, format: "commonjs", shortCircuit: true };
    }
    return result;
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:")) {
      const file = fileURLToPath(url.split("?")[0]);
      if (isProjectSource(file)) return { format: "commonjs", shortCircuit: true, source: transform(file) };
    }
    return nextLoad(url, context);
  },
});

// --- jsdom as the global DOM -----------------------------------------------------
const { JSDOM } = require(bunModule("jsdom").replace(/jsdom@[^/]+/, (m) => m)); 
const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { url: "http://localhost/", pretendToBeVisual: process.env.NT_NO_RAF !== "1" });
const win = dom.window;
const keep = new Set(["undefined", "globalThis", "window", "self", "global", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "queueMicrotask", "console", "process", "performance", "structuredClone", "crypto", "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "AbortController", "AbortSignal", "fetch", "Request", "Response", "Headers", "Blob", "File", "ReadableStream", "WritableStream", "TransformStream", "constructor"]);
// jest's jsdom environment has no Node fetch. jest-setup.js installs the
// cross-fetch polyfill, which is node-fetch there, and the suite uses jsdom's
// own AbortSignal, Blob, File and FormData. Node's versions are a different
// realm, and jsdom's addEventListener and FileReader reject them.
if (process.env.NT_NODE_FETCH !== "1") {
  // Node defines these lazily, and the first touch of any of them loads its
  // fetch implementation, which reads AbortSignal. Touch them while Node's
  // AbortSignal still exists, or the replacement below fails without a trace.
  for (const name of ["fetch", "Request", "Response", "Headers", "FormData", "MessageEvent", "WebSocket", "EventSource", "CloseEvent"]) void globalThis[name];
  for (const name of ["AbortController", "AbortSignal", "Blob", "File"]) keep.delete(name);
  for (const name of ["fetch", "Request", "Response", "Headers", "FormData", "AbortController", "AbortSignal", "Blob", "File"]) delete globalThis[name];
  if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
}
const windowKeys = new Set();
for (let proto = win; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
  for (const key of Object.getOwnPropertyNames(proto)) windowKeys.add(key);
}
const override = new Set(["Event", "EventTarget", "CustomEvent", "MessageEvent", "ErrorEvent", "KeyboardEvent", "MouseEvent", "FocusEvent", "InputEvent", "UIEvent", "PointerEvent", "DragEvent", "DOMException", "navigator", "location", "history", "localStorage", "sessionStorage", "addEventListener", "removeEventListener", "dispatchEvent", "postMessage", "MutationObserver"]);
for (const key of windowKeys) {
  if (keep.has(key)) continue;
  if (key in globalThis && !override.has(key)) continue;
  // An event handler property such as window.onkeydown is an accessor on the
  // jsdom window. Copied as a value it would have no setter, and assigning to
  // it would never reach the window, so it is copied as an accessor that
  // forwards there.
  const windowDescriptor = Object.getOwnPropertyDescriptor(win, key);
  if (/^on[a-z]+$/.test(key) && windowDescriptor?.set && process.env.NT_NO_HANDLER_ACCESSORS !== "1") {
    try {
      Object.defineProperty(globalThis, key, { configurable: true, enumerable: windowDescriptor.enumerable, get() { return win[key]; }, set(handler) { win[key] = handler; } });
      continue;
    } catch {}
  }
  let value;
  try { value = win[key]; } catch { continue; }
  const bound = typeof value === "function" && !/^[A-Z]/.test(key) ? value.bind(win) : value;
  try { Object.defineProperty(globalThis, key, { value: bound, writable: true, configurable: true, enumerable: false }); } catch {}
}
for (const alias of ["window", "self", "top", "parent"]) Object.defineProperty(globalThis, alias, { value: globalThis, configurable: true, writable: true });
for (const timer of ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask"]) {
  Object.defineProperty(win, timer, { get: () => globalThis[timer], configurable: true });
}

// --- jest globals, collected by the harness, run on node:test ------------------------
// node:test evaluates every suite body before it runs a test. jest loads and
// runs one file at a time, and the module mocks depend on that, so describe/it
// here only collect. run.cjs runs a file's collected tree as node:test subtests
// before it loads the next file.
// fetch-mock cancels an aborted request's body from an AbortSignal handler, and
// undici has already locked that stream, so the throw arrives asynchronously and
// would otherwise cut a test's cleanup short and leave its routes behind.
// node:test fails the running test on the uncaughtException event and moves on
// while this wrapper is still running, so the wrapper's cleanup then lands
// inside later tests and files. The capture callback pre-empts that event: the
// fetch-mock race is harmless (jest's jsdom reports it to the console), and any
// other error is kept for the wrapper to report as the current test's failure.
const FETCH_MOCK_ABORT_RACE = /locked for exclusive reading/;
let pendingUncaught;
let usedFakeTimers = false;
process.setUncaughtExceptionCaptureCallback((error) => {
  const message = String(error?.message ?? error);
  if (process.env.NT_UNCAUGHT) {
    fs.appendFileSync(process.env.NT_UNCAUGHT, `${currentFile}\t${currentTest}\t${message.split("\n")[0].slice(0, 180)}\n`);
  }
  if (FETCH_MOCK_ABORT_RACE.test(message)) return;
  pendingUncaught ??= error;
});

const TIMEOUT = Number(process.env.NT_TIMEOUT ?? 30000);
const HOOK_TIMEOUT = Number(process.env.NT_HOOK_TIMEOUT ?? 8000);
// Node's own timers, taken before any fake clock can replace them, so a deadline
// still fires while a test has the clock faked.
const realSetTimeout = globalThis.setTimeout;
const realSetImmediate = globalThis.setImmediate;
const realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
const TEST_HEAP_MB = Number(process.env.NT_TEST_HEAP_MB ?? 800);
const withDeadline = (run, ms) => {
  if (process.env.NT_NO_DEADLINE === "1") return Promise.resolve().then(run);
  let timer;
  let watchdog;
  const stop = () => { realClearTimeout(timer); realClearInterval(watchdog); };
  return Promise.race([
    Promise.resolve().then(run).then(
      (value) => { stop(); return value; },
      (error) => { stop(); throw error; },
    ),
    new Promise((_, reject) => {
      timer = realSetTimeout(() => {
        stop();
        // The body cannot be cancelled, and in a shared process it keeps
        // registering routes and timers for later tests to trip over, so the
        // process is spent once this fires.
        globalThis.__nodeTestSpike.poisoned = true;
        reject(new Error(`test timed out after ${ms} ms`));
      }, ms);
      // A runaway test can fill the heap long before the deadline, and an OOM
      // takes the whole process with it, so it fails as a test instead.
      const heapAtStart = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      watchdog = realSetInterval(() => {
        // The process is long lived and its heap only grows, so the limit applies
        // to what THIS test adds rather than to the total.
        const growthMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024) - heapAtStart;
        if (growthMb > TEST_HEAP_MB) {
          stop();
          reject(new Error(`test aborted after adding ${growthMb} MB of heap`));
        }
      }, 250);
    }),
  ]);
};
const newSuite = (name, mode) => ({ name, mode, children: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] });
const rootSuite = newSuite("root");
const suiteStack = [rootSuite];
const current = () => suiteStack[suiteStack.length - 1];
const format = (title, args, index) => {
  let i = 0;
  let out = String(title).replace(/%[spdifjo#%]/g, (token) => (token === "%#" ? String(index) : token === "%%" ? "%" : i < args.length ? (typeof args[i] === "object" ? JSON.stringify(args[i++]) : String(args[i++])) : token));
  if (args.length === 1 && args[0] && typeof args[0] === "object") out = out.replace(/\$([a-zA-Z_][\w.]*)/g, (_, key) => String(key.split(".").reduce((o, k) => o?.[k], args[0])));
  return out;
};
const tableRows = (strings, values) => {
  const keys = strings[0].split("|").map((s) => s.trim()).filter(Boolean);
  const rows = [];
  for (let i = 0; i < values.length; i += keys.length) rows.push([Object.fromEntries(keys.map((k, j) => [k, values[i + j]]))]);
  return rows;
};
// jest's own table implementation, so %s, %p, $named templates and tagged-template
// tables behave as the specs expect.
const { bind: bindEach } = require(bunModule("jest-each"));
const makeTest = (mode) => {
  const test = (name, fn, timeout) => {
    if (process.env.NT_DEBUG_REG) process.stderr.write(`[reg] depth=${suiteStack.length} fileSuite=${path.relative(root, String(suiteStack[1]?.name ?? "-")).slice(-50)} phase=${phase} current=${currentFile.slice(-50)} "${String(name).slice(0, 50)}"\n    ${String(new Error().stack).split("\n").slice(2, 7).map((l) => l.trim().replace(/^at /, "").replace(/\(.*\/(node_modules|frontend|enterprise)\//, "($1/")).join(" <- ")}\n`);
    current().children.push({ type: "test", name, fn, timeout, mode: fn ? mode : "todo", path: suiteStack.slice(2).map((suite) => suite.name) });
  };
  test.each = bindEach(test);
  return test;
};
const makeDescribe = (mode) => {
  const describe = (name, fn) => {
    const suite = newSuite(name, mode);
    current().children.push({ type: "suite", suite });
    suiteStack.push(suite);
    try { fn(); } finally { suiteStack.pop(); }
  };
  describe.each = bindEach(describe, false);
  return describe;
};
const it = makeTest("run");
it.skip = makeTest("skip"); it.only = makeTest("run"); it.todo = (name) => makeTest("todo")(name); it.failing = makeTest("skip");
const describe = makeDescribe("run");
describe.skip = makeDescribe("skip"); describe.only = makeDescribe("run");
// A package can register hooks when it is first imported. React Testing
// Library does, to tell React that this is a test environment. jest loads
// packages again for every file, so those hooks apply to every file. Here a
// package loads once, so its hooks are kept apart from the setup files' hooks,
// which are registered again each time the setup files run.
const packageHooks = { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] };
// React Testing Library switches React's act-environment flag on for a file,
// then off and back on around each waitFor. An async act that a waitFor did
// not wait for restores the "off" it saw when it started, whenever it
// completes. When that lands after the waitFor has returned, the flag stays off
// for the rest of the file. Under jest it lands elsewhere. Each test starts
// with the value the file was given.
let actEnvironmentForFile;
const registeredFromPackage = () => {
  const frames = (new Error().stack ?? "").split("\n").slice(3, 6);
  return frames.length > 0 && frames[0].includes("/node_modules/");
};
const hook = (kind) => (fn) => {
  if (!process.env.NT_NO_PACKAGE_HOOKS && registeredFromPackage()) {
    if (process.env.NT_DEBUG_PACKAGE_HOOKS) console.error(`[package-hook] ${kind} ${(new Error().stack ?? "").split("\n").slice(2, 5).map((l) => l.trim().replace(/.*node_modules\//, "nm/").slice(0, 90)).join(" <- ")}`);
    packageHooks[kind].push(fn);
  }
  else current()[kind].push(fn);
};
Object.assign(globalThis, {
  describe, it, test: it, xit: it.skip, xtest: it.skip, xdescribe: describe.skip, fit: it.only, fdescribe: describe.only,
  beforeAll: hook("beforeAll"), afterAll: hook("afterAll"), beforeEach: hook("beforeEach"), afterEach: hook("afterEach"),
});

let phase = "init";
const { AsyncLocalStorage } = require("node:async_hooks");
const originStore = new AsyncLocalStorage();
// Debug only: tags the async work a hook or a test body starts, so the fetch
// probe can say which one a late request came from.
const TAG_ORIGINS = process.env.NT_DEBUG_FETCH_WHEN === "1";
const runTagged = (tag, fn) => (TAG_ORIGINS ? originStore.run(tag, fn) : fn());
const hookTag = (kind, index, fn) => (TAG_ORIGINS ? `${kind}#${index}:${String(fn).replace(/\s+/g, " ").slice(0, 70)}` : kind);
let routerProbeInstalled = false;
const installRouterProbe = () => {
  if (routerProbeInstalled) return;
  const fetchMock = require("fetch-mock").default;
  const router = fetchMock.router;
  if (!router) return;
  routerProbeInstalled = true;
  const inner = router.execute.bind(router);
  router.execute = (...args) => {
    const url = String(args[0]?.[0]?.url ?? args[0]?.[0]).slice(0, 48);
    process.stderr.write(`[call] phase=${phase} routes=${router.routes.length} test="${String(currentTest).slice(0, 24)}" ${url}\n`);
    return inner(...args);
  };
};

const FLAT = process.env.NT_FLAT === "1";
let flatPass = 0;
let flatFail = 0;
let flatSkip = 0;
const flatContext = {
  test: async (name, opts, fn) => {
    if (opts && (opts.skip || opts.todo)) { flatSkip += 1; return; }
    try { await fn(flatContext); } catch { flatFail += 1; return; }
    flatPass += 1;
  },
};

const runSuite = async (suite, t, outer) => {
  const ctx = FLAT ? flatContext : t;
  const hooks = { beforeEach: [...outer.beforeEach, ...suite.beforeEach], afterEach: [...suite.afterEach, ...outer.afterEach] };
  for (const fn of suite.beforeAll) await fn();
  for (const child of suite.children) {
    if (child.type === "suite") {
      await ctx.test(child.suite.name, { skip: child.suite.mode === "skip" }, (t2) => runSuite(child.suite, t2, hooks));
      continue;
    }
    // Once a test has outlived its deadline its body is still running and still
    // writing to the shared registries, so anything after it would be scored
    // against that mess rather than its own behaviour.
    const poisoned = globalThis.__nodeTestSpike.poisoned === true;
    await ctx.test(child.name, { skip: poisoned || child.mode === "skip", todo: child.mode === "todo", timeout: child.timeout ?? TIMEOUT }, async () => {
      let failure;
      if (actEnvironmentForFile !== undefined && !process.env.NT_NO_ACT_ENV_RESTORE) globalThis.IS_REACT_ACT_ENVIRONMENT = actEnvironmentForFile;
      const testStarted = Date.now();
      if (process.env.NT_DEBUG_CLIP) {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
        const clip = globalThis.navigator.clipboard;
        process.stderr.write(`[clip] ${currentFile.slice(-36)} own=${Boolean(descriptor)} getter=${Boolean(descriptor?.get)} ctor=${clip?.constructor?.name} writeText=${typeof clip?.writeText} mock=${Boolean(clip?.writeText?._isMockFunction)} impl=${String(clip?.writeText?.getMockImplementation?.()).slice(0, 30)} winNavSame=${globalThis.window.navigator === globalThis.navigator}\n`);
      }
      ownRan += 1;
      currentTest = child.name;
      // jest joins the describe path and the test name with single spaces.
      expect.setState({ snapshotState, currentTestName: [...(child.path ?? []), child.name].join(" ") });
      if (globalThis.__nodeTestSpike.cleanupInterrupted) {
        globalThis.__nodeTestSpike.cleanupInterrupted = false;
        try {
          const fetchMock = require("fetch-mock").default;
          fetchMock.removeRoutes();
          fetchMock.callHistory.clear();
        } catch {}
        try { require(bunModule("@testing-library/react")).cleanup(); } catch {}
        globalThis.document.body.innerHTML = "";
        resetFocus();
      }
      try {
        // Work that outlives a test keeps fetching in the gap before this one
        // starts, where the routes are already gone. Those calls belong to the
        // test that spawned them, which has had its own check already.
        try { require("fetch-mock").default.callHistory.clear(); } catch {}
        phase = "beforeEach";
        for (const [index, fn] of hooks.beforeEach.entries()) await runTagged(hookTag("beforeEach", index, fn), () => withDeadline(() => fn(), HOOK_TIMEOUT));
        // node:test puts more turns of the event loop between two tests than
        // jest does. A request that the previous test's cleanup scheduled lands
        // in that gap, before this test has any route, and is recorded as
        // unmatched. It is not this test's request, so it does not count here.
        if (!process.env.NT_NO_GAP_CALL_DROP) {
          try {
            const history = require("fetch-mock").default.callHistory;
            if (history.callLogs.some((log) => !log.route)) history.callLogs = history.callLogs.filter((log) => log.route);
          } catch {}
        }
        if (process.env.NT_DEBUG_PHASE === "1") installRouterProbe();
        phase = "body";
        if (process.env.NT_DEBUG_FETCH_WHEN === "1") {
          // fetchMock.mockGlobal() in the setup's beforeEach replaces fetch, so the
          // probe has to go on after the hooks have run.
          const fetchMock = require("fetch-mock").default;
          const inner = globalThis.fetch;
          globalThis.fetch = (...args) => {
            const url = String(args[0]?.url ?? args[0]).slice(0, 55);
            const routeCount = fetchMock.router?.routes?.length ?? -1;
            process.stderr.write(`[fetch] routes=${routeCount} phase=${phase} bodyChildren=${globalThis.document.body.children.length} origin=${originStore.getStore() ?? "-"} "${currentTest.slice(0, 30)}" ${url}\n`);
            if (routeCount === 0) {
              const previousLimit = Error.stackTraceLimit;
              Error.stackTraceLimit = 80;
              const frames = String(new Error().stack).split("\n").slice(2).map((l) => l.trim().replace(/^at /, "").replace(/\(.*\/(node_modules|frontend|enterprise)\//, "($1/")).filter((l) => !/^(async )?(process\.|node:|new Promise|Promise\.|Array\.)/.test(l)).join("\n    <- ");
              Error.stackTraceLimit = previousLimit;
              process.stderr.write(`[fetch-stack] ${frames}\n`);
            }
            return inner(...args);
          };
        }
        if (process.env.NT_TRACE_TIMERS_FOR && child.name.includes(process.env.NT_TRACE_TIMERS_FOR)) {
          const shortFrames = () => String(new Error().stack).split("\n").slice(3, 7).map((l) => l.trim().replace(/^at /, "").replace(/\(.*\/node_modules\/(\.bun\/[^/]+\/node_modules\/)?/, "(nm/").replace(root, "")).join(" <- ");
          for (const name of ["setTimeout", "setInterval", "requestAnimationFrame"]) {
            const installed = globalThis[name];
            if (!installed) { process.stderr.write(`[trace] ${name} missing\n`); continue; }
            process.stderr.write(`[trace] ${name} isReal=${installed === { setTimeout: realSetTimeout, setInterval: realSetInterval }[name]} winSame=${globalThis.window[name] === installed} src=${String(installed).replace(/\s+/g, " ").slice(0, 60)}\n`);
            const wrapped = (fn, delay, ...rest) => {
              const id = installed((...args) => { process.stderr.write(`[trace] fire ${name} delay=${delay}\n`); return fn(...args); }, delay, ...rest);
              process.stderr.write(`[trace] ${name} delay=${String(delay)} ${shortFrames()}\n`);
              return id;
            };
            globalThis[name] = wrapped;
            globalThis.__nodeTestSpike.untrace = [...(globalThis.__nodeTestSpike.untrace ?? []), () => { if (globalThis[name] === wrapped) globalThis[name] = installed; }];
          }
          process.stderr.write(`[trace] Date.now-real=${Date.now() - Number(process.hrtime.bigint() / 1000000n)} perfNow=${Math.round(performance.now())} docHidden=${document.hidden} active=${document.activeElement?.tagName}\n`);
        }
        await runTagged(`body:${child.name.slice(0, 40)}`, () => withDeadline(() => child.fn(), Math.round((child.timeout ?? TIMEOUT) * 0.9)));
        phase = "afterBody";
      } catch (error) {
        phase = "afterThrow";
        failure = { error };
        // A timed-out body keeps running. Under a fake clock advancing in real
        // time it also keeps allocating, so drop its timers and hand back the
        // real ones before the next test starts.
        try { fakeTimers.clearAllTimers(); } catch {}
        fakeTimers.useRealTimers();
      }
      if (process.env.NT_DEBUG_CALLS) {
        const fetchMock = require("fetch-mock").default;
        const calls = fetchMock.callHistory.calls();
        const unmatched = calls.filter((call) => !call.route);
        if (process.env.NT_DEBUG_PROBE_FETCH === "1" && unmatched.length > 0) {
          try {
            const probe = await globalThis.fetch("http://localhost/api/table/2");
            const probeCall = fetchMock.callHistory.calls().at(-1);
            process.stderr.write(`[probe] status=${probe.status} matched=${Boolean(probeCall?.route)}\n`);
          } catch (error) {
            process.stderr.write(`[probe] threw ${String(error.message).slice(0, 60)}\n`);
          }
        }
        if (process.env.NT_DEBUG_REMATCH === "1" && unmatched[0]) {
          const call = unmatched[0];
          const routes = fetchMock.router?.routes ?? [];
          let hit = -1;
          for (let index = 0; index < routes.length; index++) {
            try { if (routes[index].matcher(call)) { hit = index; break; } } catch (error) { /* a matcher that throws is not a match */ }
          }
          process.stderr.write(
            `[rematch] hit=${hit} url=${String(call.url).slice(0, 44)} method=${call.options?.method} ` +
              `keys=${Object.keys(call).join(",")} hasRequest=${Boolean(call.request)} ` +
              `expressParams=${JSON.stringify(call.expressParams)} queryParams=${String(call.queryParams)}\n`,
          );
        }
        process.stderr.write(
          `[test] matched=${calls.length - unmatched.length} unmatched=${unmatched.length} ` +
            `routes=${fetchMock.router?.routes?.length ?? -1} "${currentTest.slice(0, 34)}" ` +
            `first=${unmatched[0] ? String(unmatched[0].url).slice(0, 40) : "-"}\n`,
        );
      }
      phase = "afterEach";
      for (const fn of hooks.afterEach) {
        // A hook that never settles would skip every cleanup after it, and the
        // routes and timers it leaves behind fail the following tests instead.
        try { await runTagged(hookTag("afterEach", hooks.afterEach.indexOf(fn), fn), () => withDeadline(() => fn(), HOOK_TIMEOUT)); } catch (error) { failure ??= { error }; }
      }
      // jest's own afterEach clears the routes, but it flushes first, and a
      // throwing flush would leave them for the next test to collide with.
      try {
        const fetchMock = require("fetch-mock").default;
        if (process.env.NT_DEBUG_FM) {
          console.error(`[fm] after ${child.name}: routes=${fetchMock.router?.routes?.length}`);
        }
        fetchMock.removeRoutes();
        fetchMock.callHistory.clear();
        phase = "between";
        if (process.env.NT_DEBUG_FM) {
          console.error(`[fm] cleared: routes=${fetchMock.router?.routes?.length}`);
        }
      } catch (error) {
        if (process.env.NT_DEBUG_FM) console.error(`[fm] reset threw: ${error.message}`);
      }
      if (usedFakeTimers) {
        usedFakeTimers = false;
        cancelLeftoverFrames();
      }
      for (const undo of globalThis.__nodeTestSpike.untrace ?? []) undo();
      globalThis.__nodeTestSpike.untrace = undefined;
      if (pendingUncaught) {
        failure ??= { error: pendingUncaught };
        pendingUncaught = undefined;
      }
      if (globalThis.__nodeTestSpike.cacheAtFake) {
        const before = globalThis.__nodeTestSpike.cacheAtFake;
        globalThis.__nodeTestSpike.cacheAtFake = undefined;
        for (const key of Object.keys(require.cache)) if (!before.has(key)) process.stderr.write(`[fake-load] ${key.replace(/.*\/node_modules\//, "nm/").replace(root, "")}\n`);
      }
      if (process.env.NT_DEBUG_TESTS) process.stderr.write(`[test-done] ms=${Date.now() - testStarted} ${failure ? "FAIL" : "ok"} ${currentFile.slice(-40)} "${child.name.slice(0, 50)}"\n`);
      if (failure) {
        if (process.env.NT_FAILURE_DETAIL) fs.appendFileSync(process.env.NT_FAILURE_DETAIL, `\n===== ${currentFile} > ${child.name}\n${String(failure.error?.stack ?? failure.error).slice(0, 40000)}\n`);
        if (process.env.NT_FAILURES) fs.appendFileSync(process.env.NT_FAILURES, `${currentFile}\t${child.name}\t${String(failure.error?.message ?? failure.error).split("\n")[0].slice(0, 200)}\n`);
        throw failure.error;
      }
    });
  }
  for (const fn of suite.afterAll) await fn();
};

// A spec may pin document.activeElement with a non-configurable data property,
// which jest discards with its document but a shared one cannot. Keeping such a
// definition configurable is what makes it removable between files.
const originalDefineProperty = Object.defineProperty;
Object.defineProperty = function defineProperty(target, key, descriptor) {
  if (key === "activeElement" && target === globalThis.document) {
    return originalDefineProperty(target, key, { ...descriptor, configurable: true });
  }
  return originalDefineProperty(target, key, descriptor);
};

const resetFocus = () => {
  const document = globalThis.document;
  if (document.activeElement === document.body) return;
  // Neither blur() on a detached node nor body.focus() moves jsdom's focus, so a
  // real focus transition through a throwaway element is what clears it.
  try {
    if (Object.getOwnPropertyDescriptor(document, "activeElement")) {
      delete document.activeElement;
    }
  } catch {}
};

// jest runs all of these for every file, so an evicted graph has to see them all.
// setupFiles then setupFilesAfterEnv, as jest.config.js lists them for each
// project. The SDK project has its own additions and leaves the core one out.
const SETUP_CHAIN = process.env.NT_PROJECT === "sdk"
  ? [
      "frontend/test/jest-setup.js",
      "frontend/test/metabase-bootstrap.js",
      "frontend/test/register-visualizations.js",
      "frontend/src/embedding-sdk-shared/jest/setup-env.ts",
      "frontend/test/jest-setup-eager.js",
      "frontend/test/jest-setup-env.js",
      "frontend/src/embedding-sdk-shared/jest/setup-after-env.ts",
      "frontend/src/embedding-sdk-shared/jest/console-restrictions.ts",
    ]
  : [
      "frontend/test/jest-setup.js",
      "frontend/test/metabase-bootstrap.js",
      "frontend/test/register-visualizations.js",
      "frontend/test/jest-setup-eager.js",
      "frontend/test/jest-setup-env.js",
      "frontend/test/jest-setup-env-core.js",
    ];

// jest's own runner, behind NT_CIRCUS=1, so its collection, hook ordering,
// timeouts and failure semantics replace the hand-rolled ones.
const USE_CIRCUS = process.env.NT_CIRCUS === "1";
const circus = USE_CIRCUS ? require(path.join(bunModule("jest-circus"), "build/index.js")) : null;
const circusFailures = [];
let circusRan = 0;
let ownRan = 0;
let circusSkipped = 0;
let circusTodo = 0;
if (USE_CIRCUS) {
  Object.assign(globalThis, {
    describe: circus.describe,
    it: circus.it,
    test: circus.test,
    xit: circus.it.skip,
    xtest: circus.test.skip,
    xdescribe: circus.describe.skip,
    fit: circus.it.only,
    fdescribe: circus.describe.only,
    beforeAll: circus.beforeAll,
    afterAll: circus.afterAll,
    beforeEach: circus.beforeEach,
    afterEach: circus.afterEach,
  });
  const nameOf = (test) => {
    const parts = [];
    for (let node = test; node && node.name !== "ROOT_DESCRIBE_BLOCK"; node = node.parent) parts.unshift(node.name);
    return parts;
  };
  circus.addEventHandler((event) => {
    if (event.name === "test_done") circusRan += 1;
    if (event.name === "test_skip") circusSkipped += 1;
    if (event.name === "test_todo") circusTodo += 1;
    if (event.name === "test_done" && event.test.errors.length > 0) {
      const parts = nameOf(event.test);
      const error = [event.test.errors[0]].flat()[0];
      circusFailures.push({ path: parts.slice(0, -1), name: parts.at(-1) ?? "", error });
    }
    if (event.name === "test_start") {
      const parts = nameOf(event.test);
      currentTest = parts.at(-1) ?? "";
      expect.setState({ snapshotState, currentTestName: parts.join(" ") });
    }
  });
}

const MOCKING_API = /\bjest\.(mock|doMock|unmock|resetModules|isolateModules)\(/;
// Every file gets a fresh registry, which is jest's model on Node's own loader.
const ISOLATE_ALL = process.env.NT_ISOLATE_ALL === "1";
// Mantine keeps a module-level theme whose component overrides close over project
// components, so leaving it cached hands the next file's tree the old graph's ones.
const EVICTABLE_PACKAGES = process.env.NT_SHARE_UI_PACKAGES === "1" ? /$^/ : /\/node_modules\/(@mantine|@emotion)\//;
// Project modules that are shared between isolated files the way packages are.
// stateless-tier.cjs writes the list: modules of the named areas that hold no
// module-level state and import only packages and one another, so nothing in
// the set can point at a module that is rebuilt.
const STABLE_MODULES = new Set(
  process.env.NT_STABLE_MODULES === "1" && fs.existsSync(path.join(__dirname, "stable-modules.json"))
    ? JSON.parse(fs.readFileSync(path.join(__dirname, "stable-modules.json"), "utf8")).map(abs)
    : [],
);
const isEvictable = (file) => (isProjectSource(file) && !STABLE_MODULES.has(file)) || EVICTABLE_PACKAGES.test(file);
const evictProjectModules = () => {
  if (process.env.NT_DEBUG_EVICT) {
    for (const file of Object.keys(require.cache)) {
      if (file.includes("overlays/overlay-stack") || file.includes("metabase/ui/index")) {
        console.error(`[ev] ${isEvictable(file) ? "evict" : "KEEP "} ${file.replace(/.*\/(frontend|node_modules)\//, "$1/")}`);
      }
    }
  }
  for (const file of Object.keys(require.cache)) if (isEvictable(file)) delete require.cache[file];
};
let preloadMocks = null;
let currentFile = "";
let currentTest = "";
// A spec often registers its mocks from an imported setup file, so the source
// scan cannot see them and only the run itself knows.
let mockedThisFile = false;
let initialBootstrap;
// user-event installs a getter-only navigator.clipboard, and the setup chain
// assigns to that property, so re-running the chain throws unless it is dropped.
// sinon's uninstall deletes a timer global when it believes it was not an own
// property, and once deleted every later install repeats it, so the originals go
// back after each file.
// jest drops a file's pending timers with its environment. One shared realm keeps
// them, so a 60 second RTK cache timer from file 3 fires during file 40 and the
// loop waits for it. Timers created while a file runs are tracked and cleared.
const pendingTimers = new Set();
const trackedTimers = {
  setTimeout: (fn, delay, ...rest) => { const handle = realSetTimeout(fn, delay, ...rest); pendingTimers.add(handle); return handle; },
  setInterval: (fn, delay, ...rest) => { const handle = realSetInterval(fn, delay, ...rest); pendingTimers.add(handle); return handle; },
};
// True while the clock is Node's own, tracked or not, and false under a fake clock.
const clockIsReal = () => globalThis.setInterval === realSetInterval || globalThis.setInterval === trackedTimers.setInterval;
const trackTimers = () => {
  for (const name of ["setTimeout", "setInterval"]) {
    const original = name === "setTimeout" ? realSetTimeout : realSetInterval;
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: trackedTimers[name],
    });
  }
};
const clearPendingTimers = () => {
  let cleared = 0;
  for (const handle of pendingTimers) {
    try { realClearTimeout(handle); realClearInterval(handle); cleared += 1; } catch {}
  }
  pendingTimers.clear();
  if (process.env.NT_DEBUG_TIMERS_LEFT) console.error(`[timers] cleared ${cleared} after ${currentFile}`);
};

// jsdom drives requestAnimationFrame from one interval that it starts when the
// first callback is queued and stops when the last one has run. Started under a
// fake clock, that interval dies with the clock while jsdom still counts its
// callbacks as pending, so no frame fires again in this window. jest gives each
// file a new window. Here the leftover callbacks are cancelled, which returns
// jsdom's count to zero and lets the next request start a real interval.
const requestFrame = globalThis.window.requestAnimationFrame;
const cancelFrame = globalThis.window.cancelAnimationFrame;
let lastCancelledFrame = 0;
const cancelLeftoverFrames = () => {
  if (process.env.NT_NO_FRAME_RESET || !clockIsReal()) return;
  const newest = requestFrame.call(globalThis.window, () => {});
  for (let handle = lastCancelledFrame + 1; handle <= newest; handle += 1) cancelFrame.call(globalThis.window, handle);
  lastCancelledFrame = newest;
};

const restoreTimerGlobals = () => {
  const originals = {
    setTimeout: realSetTimeout,
    clearTimeout: realClearTimeout,
    setInterval: realSetInterval,
    clearInterval: realClearInterval,
  };
  for (const [name, fn] of Object.entries(originals)) {
    if (typeof globalThis[name] !== "function") {
      Object.defineProperty(globalThis, name, { value: fn, writable: true, configurable: true });
    }
  }
};

const resetNavigator = () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
  if (descriptor && (descriptor.get || descriptor.writable === false)) {
    try { delete globalThis.navigator.clipboard; } catch {}
  }
};

const exportIds = new WeakMap();
let nextExportId = 0;
const describeExports = (specifier, keys) => {
  const resolved = resolveProject(specifier, abs("frontend/test/__support__/ui.tsx"));
  const cached = resolved && require.cache[resolved];
  if (!cached) return `${specifier}: not loaded`;
  const exported = cached.exports;
  if (!exportIds.has(exported)) exportIds.set(exported, (nextExportId += 1));
  const shape = keys.map((key) => `${key}=${typeof exported[key]}`).join(" ");
  return `${specifier}: object#${exportIds.get(exported)} keys=${Object.keys(exported).length} ${shape}`;
};
const fileCleanup = async (isolated) => {
  if (process.env.NT_DEBUG_EXPORTS) {
    const apiFile = resolveProject("metabase/api", abs("frontend/test/__support__/ui.tsx"));
    console.error(`[exports] after ${currentFile} isolated=${isolated} mockedThisFile=${mockedThisFile} mocks=${mocks.size} apiMocked=${mocks.has(apiFile)}\n  ${describeExports("metabase/api", ["Api", "shouldSchemaBePassedAsQueryParam"])}\n  ${describeExports("metabase/metadata-store", ["createMockEntitiesState"])}`);
  }
  finishSnapshots();
  const timerShape = (label) => { if (process.env.NT_DEBUG_TIMER_SHAPE) console.error(`[timer-shape] ${label} global=${typeof globalThis.clearTimeout} real=${globalThis.clearTimeout === realClearTimeout} own=${Object.prototype.hasOwnProperty.call(globalThis, "clearTimeout")} window=${typeof globalThis.window.clearTimeout} mock=${Boolean(globalThis.clearTimeout?._isMockFunction)}`); };
  globalThis.__nodeTestSpike.timerShape = timerShape;
  timerShape("cleanup-start");
  // A spy that a file never restores would be undone by the next file's own
  // restoreAllMocks, on top of globals that have been reset since. Spies go
  // first, so the fake clock a spy wrapped is back in place to be uninstalled.
  if (!process.env.NT_NO_SPY_RESTORE) moduleMocker.restoreAllMocks();
  fakeTimers.useRealTimers();
  timerShape("after-useRealTimers");
  restoreTimerGlobals();
  if (!process.env.NT_NO_TIMER_CLEAR) { clearPendingTimers(); trackTimers(); }
  cancelLeftoverFrames();
  const fetchMock = require("fetch-mock").default;
  const phaseStart = Date.now();
  try { await fetchMock.callHistory.flush(true); } catch {}
  if (process.env.NT_DEBUG_CLEANUP) {
    console.error(`[cleanup] flush ${Date.now() - phaseStart} ms ${currentFile}`);
  }
  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();
  document.body.innerHTML = "";
  // jsdom leaves activeElement pointing at a removed node, and userEvent then
  // refuses to focus anything in the next file.
  resetFocus();
  resetNavigator();
  globalThis.__nodeTestSpike.resetVisualizations?.();
  if (!process.env.NT_NO_REALM_RESTORE) globalThis.__nodeTestSpike.restoreRealm?.();
  if (process.env.NT_DEBUG_STATE_DIFF) { console.error(`[state] === after ${currentFile}`); stateDiff(); }
  globalThis.__nodeTestSpike.measureEnd?.(isolated);
  globalThis.__nodeTestSpike.restoreSharedPackages?.();
  globalThis.__nodeTestSpike.resetLets?.();
  restoreSetupMocks();
  globalThis.__nodeTestSpike.betweenFiles?.();
  resetDayjsLocale();
  resetSettings();
  timerShape("after-realm");
  if (isolated) {
    mocks.clear();
    for (const [key, factory] of preloadMocks) mocks.set(key, factory);
    state.mockExports.clear(); globalThis.__nodeTestSpike.clearActualModules?.();
    // The stub modules live outside the project, so eviction spares them, and
    // their cached exports would hand the next file objects from the old graph.
    for (const stubFile of mockStubs.values()) delete require.cache[stubFile];
    evictProjectModules();
    globalThis.window.MetabaseBootstrap = { ...initialBootstrap };
    resetNavigator();
    runSetupChain();
  }
  require("metabase/plugins").reinitialize();
};

let filesRunHere = 0;
let fileStarted = 0;
globalThis.__nodeTestSpike.runFile = async (t, file) => {
  fileStarted = Date.now();
  preloadMocks ??= new Map(mocks);
  currentFile = path.relative(root, file);
  const isolated = ISOLATE_ALL || MOCKING_API.test(fs.readFileSync(file, "utf8"));
  startSnapshots(file);
  ownRan = 0;
  if (USE_CIRCUS) {
    // A fresh state per file, registered before the isolated cleanup re-runs the
    // setup chain, which is what puts the root hooks back. Requiring the chain
    // here as well would run jest-setup-env.js twice and its navigator
    // assignment fails the second time.
    circus.resetState();
  }
  mockedThisFile = false;
  if (process.env.NT_DEBUG_STATE_DUMP && currentFile.includes(process.env.NT_DEBUG_STATE_AT ?? "\0")) globalThis.__nodeTestSpike.dumpState(process.env.NT_DEBUG_STATE_DUMP);
  if (isolated) {
    evictProjectModules();
    globalThis.window.MetabaseBootstrap = { ...initialBootstrap };
    runSetupChain();
  }
  if (USE_CIRCUS) {
    try {
      circusFailures.length = 0;
      circusRan = 0;
      circusSkipped = 0;
      circusTodo = 0;
      // setState REPLACES circus's whole state, so the timeout is merged in.
      circus.setState({ ...circus.getState(), testTimeout: TIMEOUT });
      require(file);
      await circus.run();
      for (const failure of circusFailures) {
        const message = String(failure.error?.message ?? failure.error).split("\n")[0].slice(0, 200);
        if (process.env.NT_FAILURES) fs.appendFileSync(process.env.NT_FAILURES, `${currentFile}\t${failure.name}\t${message}\n`);
        if (process.env.NT_FAILURE_DETAIL) fs.appendFileSync(process.env.NT_FAILURE_DETAIL, `\n===== ${currentFile} > ${failure.name}\n${String(failure.error?.stack ?? failure.error).slice(0, 40000)}\n`);
      }
      if (process.env.NT_DEBUG_CIRCUS) console.error(`[circus] ${currentFile}: ran=${circusRan} skipped=${circusSkipped} todo=${circusTodo} failed=${circusFailures.length}`);
      if (circusFailures.length > 0) throw new Error(`${circusFailures.length} failing tests`);
      return;
    } finally {
      // A jest.mock reached from an imported helper is invisible to the source scan,
      // so the run's own record decides: a file that mocked gets the isolated cleanup.
      await fileCleanup(isolated || (mockedThisFile && !process.env.NT_NO_MOCK_ISOLATE));
    }
  }
  let fileSuite = newSuite(file);
  suiteStack.push(fileSuite);
  globalThis.__nodeTestSpike.measureStart?.();
  try { require(file); } finally { suiteStack.pop(); }
  // A file whose jest.mock calls sit in an imported helper was not isolated at
  // its start, so modules from earlier files have their real dependencies
  // resolved already and would never see these mocks. The file starts again
  // on a fresh registry, with its mocks now known, before any test body runs.
  if (mockedThisFile && !isolated && !process.env.NT_NO_LATE_ISOLATE) {
    evictProjectModules();
    globalThis.window.MetabaseBootstrap = { ...initialBootstrap };
    runSetupChain();
    fileSuite = newSuite(file);
    suiteStack.push(fileSuite);
    try { require(file); } finally { suiteStack.pop(); }
  }
  try {
    for (const fn of [...packageHooks.beforeAll, ...rootSuite.beforeAll]) await fn();
    actEnvironmentForFile = globalThis.IS_REACT_ACT_ENVIRONMENT;
    try {
      await runSuite(fileSuite, t, { beforeEach: [...packageHooks.beforeEach, ...rootSuite.beforeEach], afterEach: [...packageHooks.afterEach, ...rootSuite.afterEach] });
    } finally {
      for (const fn of [...rootSuite.afterAll, ...packageHooks.afterAll]) { try { await fn(); } catch {} }
    }
  } finally {
    if (process.env.NT_DEBUG_RAN) process.stderr.write(`[ran] ${currentFile}: ${ownRan}${FLAT ? ` pass=${flatPass} fail=${flatFail} skip=${flatSkip}` : ""}\n`);
    if (process.env.NT_DEBUG_PERFILE) {
      filesRunHere += 1;
      process.stderr.write(`[file] pid=${process.pid} idx=${filesRunHere} ms=${Date.now() - fileStarted} rss=${Math.round(process.memoryUsage().rss / 1048576)} mods=${Object.keys(require.cache).length} ${currentFile}\n`);
    }
    // A jest.mock reached from an imported helper is invisible to the source scan,
      // so the run's own record decides: a file that mocked gets the isolated cleanup.
      await fileCleanup(isolated || (mockedThisFile && !process.env.NT_NO_MOCK_ISOLATE));
  }
  return isolated;
};

const { expect } = require(bunModule("expect"));
globalThis.expect = expect;

// jest's own snapshot matchers, wired to a per-file SnapshotState the way jest does.
const jestSnapshot = require(bunModule("jest-snapshot"));
let snapshotState = null;
const snapshotPathFor = (file) =>
  path.join(path.dirname(file), "__snapshots__", `${path.basename(file)}.snap`);
const startSnapshots = (file) => {
  snapshotState = new jestSnapshot.SnapshotState(snapshotPathFor(file), {
    updateSnapshot: process.env.NT_UPDATE_SNAPSHOTS ? "all" : "new",
    snapshotFormat: { escapeString: false, printBasicPrototype: false },
    rootDir: root,
  });
};
const finishSnapshots = () => {
  if (snapshotState) snapshotState.save();
  snapshotState = null;
};
expect.setState({ snapshotState: null, currentTestName: "" });
expect.extend({
  toMatchSnapshot: jestSnapshot.toMatchSnapshot,
  toMatchInlineSnapshot: jestSnapshot.toMatchInlineSnapshot,
  toThrowErrorMatchingSnapshot: jestSnapshot.toThrowErrorMatchingSnapshot,
  toThrowErrorMatchingInlineSnapshot: jestSnapshot.toThrowErrorMatchingInlineSnapshot,
});
const { ModuleMocker } = require(bunModule("jest-mock"));
const moduleMocker = new ModuleMocker(globalThis);
const { ModernFakeTimers } = require(bunModule("@jest/fake-timers"));
// Reads and writes reach globalThis, while the identity check that makes sinon
// fake the `timers` module as well sees a different object. node:test builds its
// per-test timeout on that module, and jest's jsdom global is separate the same way.
const timerGlobal = new Proxy(globalThis, {});
const fakeTimers = new ModernFakeTimers({ global: timerGlobal, config: {
    fakeTimers: {
      enableGlobally: false,
      timerLimit: Number(process.env.NT_TIMER_LIMIT ?? 20000),
      // The clock installs on the real globalThis, so faking these would replace
      // the microtask primitives Node's own fetch body parsing runs on, and its
      // read loop then spins. jest fakes them safely because its clock installs
      // on a sandboxed jsdom global whose process is a separate object.
      doNotFake: ["nextTick", "queueMicrotask"],
    },
    rootDir: root,
  } });

const callerFile = () => {
  const frames = (new Error().stack ?? "").split("\n").slice(1);
  for (const frame of frames) {
    const match = frame.match(/\(?(?:file:\/\/)?(\/[^:)]+):\d+:\d+\)?$/);
    if (match && !match[1].endsWith("hooks.cjs") && !match[1].includes("node:")) return match[1];
  }
  return abs("frontend/src/index.ts");
};
const Module = require("node:module");
const resolveFrom = (id, from) => {
  // A builtin has no file, so its mock is keyed by the url the resolve hook sees.
  if (Module.isBuiltin(id)) return `node:${id.replace(/^node:/, "")}`;
  const project = resolveProject(id, from);
  if (project) return project;
  return Module.createRequire(from).resolve(id);
};
// Node remembers what each directory resolved a request to, and skips the
// resolve hook when that module is still cached. A spec directory that has
// been handed the stub for a path would get the stub again here, so the real
// module is asked for from a directory that only ever sees real modules.
const requireFromActualDirectory = Module.createRequire(path.join(processDir, "actual", "index.js"));
// The same memory works against a mock too. A directory that resolved a
// request to the real file gets the real module again for as long as Node has
// it cached, and the resolve hook, which would hand out the mock, is not asked.
// So the real module of a mocked file never stays in Node's cache: it is held
// here, for requireActual and for automocks.
const actualModules = new Map();
globalThis.__nodeTestSpike.clearActualModules = () => actualModules.clear();
const requireFromActual = (file) => {
  if (actualModules.has(file)) return actualModules.get(file);
  const actual = requireFromActualDirectory(file);
  if (mocks.has(file) && !process.env.NT_NO_MOCK_CACHE_FIX) {
    actualModules.set(file, actual);
    delete require.cache[file];
  }
  return actual;
};
const requireActual = (id) => {
  const from = callerFile();
  const file = resolveFrom(id, from);
  if (file.startsWith("node:")) return process.getBuiltinModule(file);
  bypassMocks += 1;
  try {
    const actual = requireFromActual(file);
    if (process.env.NT_DEBUG_MOCK_SHAPE) console.error(`[require-actual] id=${id} from=${from.replace(root, "")} file=${String(file).replace(root, "")} keys=${Object.keys(actual ?? {}).length} cached=${Boolean(require.cache[file])} loaded=${require.cache[file]?.loaded}`);
    return actual;
  } finally { bypassMocks -= 1; }
};
const jestMock = (id, factory) => {
  const from = callerFile();
  const file = resolveFrom(id, from);
  const manualMock = path.join(path.dirname(file), "__mocks__", path.basename(file));
  if (factory) mocks.set(file, factory);
  else if (findFile(manualMock.replace(/\.[jt]sx?$/, ""))) mocks.set(file, () => Module.createRequire(from)(findFile(manualMock.replace(/\.[jt]sx?$/, ""))));
  // The loader remembers what a parent resolved a request to, and for a builtin
  // that is now the stub, so the real module comes from the process instead.
  else if (file.startsWith("node:")) mocks.set(file, () => moduleMocker.generateFromMetadata(moduleMocker.getMetadata(process.getBuiltinModule(file))));
  else mocks.set(file, () => { bypassMocks += 1; try { return moduleMocker.generateFromMetadata(moduleMocker.getMetadata(requireFromActual(file))); } finally { bypassMocks -= 1; } });
  state.mockExports.delete(file);
  actualModules.delete(file);
  if (!process.env.NT_NO_MOCK_CACHE_FIX && !file.startsWith("node:")) delete require.cache[file];
  mockedThisFile = true;
  // Consumers require the mock through a stub path, and Node caches that module,
  // so a later file's factory would otherwise never be read.
  const stubFile = mockStubs.get(file);
  if (stubFile) delete require.cache[stubFile];
  return globalThis.jest;
};
// A spec's resetAllMocks also strips the implementations of the mocks the setup
// files install, such as the clipboard. jest builds those again for each file.
// Here the harness remembers what each one did and puts it back between files.
let setupMocksOpen = false;
let setupMocksPending = [];
const setupMocks = [];
const runSetupChain = () => {
  // The setup files register the root hooks each time they run. Without this
  // every isolated file would add another copy for all later tests to run.
  for (const kind of ["beforeAll", "afterAll", "beforeEach", "afterEach"]) rootSuite[kind].length = 0;
  setupMocksOpen = true;
  try {
    for (const setupFile of SETUP_CHAIN) require(abs(setupFile));
  } finally {
    setupMocksOpen = false;
    for (const mock of setupMocksPending) {
      const implementation = mock.getMockImplementation();
      if (implementation) setupMocks.push([mock, implementation]);
    }
    setupMocksPending = [];
  }
};
const restoreSetupMocks = () => {
  if (process.env.NT_NO_SETUP_MOCK_RESTORE) return;
  for (const [mock, implementation] of setupMocks) {
    if (!mock.getMockImplementation()) mock.mockImplementation(implementation);
  }
};
const takeProjectModules = () => {
  const taken = new Map();
  for (const file of Object.keys(require.cache)) {
    if (isEvictable(file)) { taken.set(file, require.cache[file]); delete require.cache[file]; }
  }
  return taken;
};
const putProjectModules = (taken) => {
  evictProjectModules();
  for (const [file, cached] of taken) require.cache[file] = cached;
};
globalThis.jest = {
  fn: (implementation) => {
    const mock = moduleMocker.fn(implementation);
    if (setupMocksOpen) setupMocksPending.push(mock);
    return mock;
  },
  spyOn: moduleMocker.spyOn.bind(moduleMocker),
  mocked: (value) => value,
  isMockFunction: moduleMocker.isMockFunction.bind(moduleMocker),
  clearAllMocks: () => moduleMocker.clearAllMocks(),
  resetAllMocks: () => moduleMocker.resetAllMocks(),
  restoreAllMocks: () => moduleMocker.restoreAllMocks(),
  replaceProperty: moduleMocker.replaceProperty?.bind(moduleMocker),
  mock: jestMock,
  doMock: jestMock,
  unmock: (id) => { mocks.delete(resolveFrom(id, callerFile())); return globalThis.jest; },
  requireActual,
  requireMock: (id) => {
    const from = callerFile();
    const file = resolveFrom(id, from);
    return mocks.has(file) ? globalThis.__nodeTestSpike.mockExports(file) : Module.createRequire(from)(file);
  },
  // Project modules load again on their next require. Packages stay, as they
  // do for an isolated file, so React and the testing library keep one copy.
  resetModules: () => {
    if (!process.env.NT_NO_RESET_MODULES) { evictProjectModules(); state.mockExports.clear(); globalThis.__nodeTestSpike.clearActualModules?.(); }
    return globalThis.jest;
  },
  isolateModules: (fn) => {
    const outer = takeProjectModules();
    try { fn(); } finally { putProjectModules(outer); }
  },
  isolateModulesAsync: async (fn) => {
    const outer = takeProjectModules();
    try { await fn(); } finally { putProjectModules(outer); }
  },
  useFakeTimers: (config) => {
    fakeTimers.useFakeTimers(config);
    usedFakeTimers = true;
    if (process.env.NT_DEBUG_FAKE_LOADS) globalThis.__nodeTestSpike.cacheAtFake ??= new Set(Object.keys(require.cache));
    if (process.env.NT_DEBUG_TIMERS) {
      for (const name of ["setInterval", "setTimeout"]) {
        const installed = globalThis[name];
        globalThis[name] = (fn, delay, ...rest) => {
          console.error(`[${name}] delay=${String(delay)}`);
          return installed(fn, delay, ...rest);
        };
      }
    }
    return globalThis.jest;
  },
  useRealTimers: () => { fakeTimers.useRealTimers(); return globalThis.jest; },
  advanceTimersByTime: (ms) => fakeTimers.advanceTimersByTime(ms),
  advanceTimersByTimeAsync: (ms) => fakeTimers.advanceTimersByTimeAsync(ms),
  runAllTimers: () => fakeTimers.runAllTimers(),
  runAllTimersAsync: () => fakeTimers.runAllTimersAsync(),
  runOnlyPendingTimers: () => fakeTimers.runOnlyPendingTimers(),
  runOnlyPendingTimersAsync: () => fakeTimers.runOnlyPendingTimersAsync(),
  advanceTimersToNextTimer: (steps) => fakeTimers.advanceTimersToNextTimer(steps),
  clearAllTimers: () => fakeTimers.clearAllTimers(),
  getTimerCount: () => fakeTimers.getTimerCount(),
  setSystemTime: (now) => fakeTimers.setSystemTime(now),
  getRealSystemTime: () => fakeTimers.getRealSystemTime(),
  now: () => fakeTimers.now(),
  retryTimes: () => globalThis.jest,
  setTimeout: () => globalThis.jest,
};
globalThis.ga = {};

// --- setupFiles + setupFilesAfterEnv, in jest order ---------------------------------
const measured = { consts: new Map(), testWrites: new Set(), before: null };
const shallowPrint = (value) => {
  if (value === null || typeof value !== "object") return null;
  try {
    if (Array.isArray(value)) return `a${value.length}:${value.slice(0, 60).map(identityOf).join(",")}`;
    const keys = Object.keys(value);
    return `o${keys.length}:${keys.slice(0, 60).map((key) => { let item; try { item = value[key]; } catch { item = "!"; } return `${key}=${identityOf(item)}`; }).join(",")}`;
  } catch { return null; }
};
globalThis.__nodeTestSpike.trackConsts = (file, names, read) => {
  let values;
  try { values = read(); } catch { return; }
  const kept = [];
  values.forEach((value, index) => {
    if (value === null || typeof value !== "object" || value.$$typeof) return;
    const label = `${file.replace(root, "")}:${names[index]}`;
    if (value instanceof Map || value instanceof Set) {
      for (const method of ["set", "add", "delete", "clear"]) {
        if (typeof value[method] !== "function") continue;
        const original = value[method];
        try {
          Object.defineProperty(value, method, { configurable: true, writable: true, value: function (...args) {
            if (!globalThis.__nodeTestSpike.isLoading() && (phase === "body" || phase === "beforeEach" || phase === "afterEach")) measured.testWrites.add(label);
            return original.apply(this, args);
          } });
        } catch {}
      }
      return;
    }
    if (value instanceof WeakMap || value instanceof WeakSet || value instanceof RegExp || value instanceof Date) return;
    kept.push([label, value]);
  });
  measured.consts.set(file, kept);
};
const printAll = () => {
  const prints = new Map();
  for (const kept of measured.consts.values()) for (const [label, value] of kept) prints.set(label, shallowPrint(value));
  return prints;
};
const measureStart = () => { if (process.env.NT_MEASURE_DIRTY) { measured.before = printAll(); measured.testWrites.clear(); } };
const measureEnd = (isolated) => {
  if (!process.env.NT_MEASURE_DIRTY || !measured.before) return;
  const changedLets = [];
  for (const [file, tracked] of trackedLets) {
    try { tracked.read().forEach((value, index) => { if (value !== tracked.baseline[index]) changedLets.push(`${file.replace(root, "")}#${index}`); }); } catch {}
  }
  const changedObjects = [];
  for (const [label, print] of printAll()) {
    const before = measured.before.get(label);
    if (before !== undefined && before !== print) changedObjects.push(label);
  }
  const short = (list) => list.slice(0, 4).map((item) => item.replace(/^\/(frontend|enterprise\/frontend)\/src\//, "")).join(" ");
  fs.appendFileSync(process.env.NT_MEASURE_DIRTY, [currentFile, isolated ? 1 : 0, changedLets.length, measured.testWrites.size, changedObjects.length, globalThis.__nodeTestSpike.lastRealmRestored ?? 0, measured.consts.size, short(changedLets), short([...measured.testWrites]), short(changedObjects)].join("\t") + "\n");
  measured.before = null;
};
globalThis.__nodeTestSpike.measureStart = measureStart;
globalThis.__nodeTestSpike.measureEnd = measureEnd;
const trackedLets = new Map();
globalThis.__nodeTestSpike.trackLets = (file, read, write) => { trackedLets.set(file, { baseline: read(), read, write }); };
// Other modules write into these bindings while they load: a registry gets its
// default, a renderer gets installed. Those modules will not load again, so a
// value written during a load is part of the baseline. Only what test code
// writes, outside any load, is undone between files.
{
  const NodeModule = require("node:module");
  const loadModule = NodeModule._load;
  let loadDepth = 0;
  let valuesBeforeLoad = null;
  const readAll = () => {
    const values = new Map();
    for (const [file, tracked] of trackedLets) {
      try { values.set(file, tracked.read()); } catch {}
    }
    return values;
  };
  globalThis.__nodeTestSpike.isLoading = () => loadDepth > 0;
  // With the UI packages shared between isolated files, project code can still
  // write onto a package's own objects while it loads, as the popover dropdown
  // registration does. The package would then keep pointing at one file's copy
  // of that code. Each package export is recorded as it was when control first
  // came back to project code, and put back between files.
  const SHARED_UI = process.env.NT_SHARE_UI_PACKAGES === "1" ? /\/node_modules\/(@mantine|@emotion)\// : null;
  const packageModulesPending = [];
  const packageBaselines = [];
  const packageSeen = new WeakSet();
  const ownDescriptors = (target) => new Map(Reflect.ownKeys(target).map((key) => [key, Object.getOwnPropertyDescriptor(target, key)]));
  const recordPackageExports = () => {
    for (const loaded of packageModulesPending.splice(0)) {
      const candidates = [loaded.exports];
      try { for (const key of Object.keys(loaded.exports ?? {})) candidates.push(loaded.exports[key]); } catch {}
      for (const candidate of candidates) {
        if (candidate === null || (typeof candidate !== "object" && typeof candidate !== "function") || packageSeen.has(candidate)) continue;
        packageSeen.add(candidate);
        try { packageBaselines.push([candidate, ownDescriptors(candidate)]); } catch {}
      }
    }
  };
  // Under jest the global object is the jsdom window, so a package that defines
  // a global, such as the CSS.escape polyfill, also defines it on the window.
  // Here they are two objects. Whatever a package adds to the global object is
  // made readable from the window as well.
  let packagesLoadedSinceMirror = true;
  const mirrorGlobalsOntoWindow = () => {
    packagesLoadedSinceMirror = false;
    if (process.env.NT_NO_WINDOW_MIRROR) return;
    for (const key of Object.getOwnPropertyNames(globalThis)) {
      if (key in win) continue;
      try { Object.defineProperty(win, key, { configurable: true, get: () => globalThis[key], set: (value) => { globalThis[key] = value; } }); } catch {}
    }
  };
  globalThis.__nodeTestSpike.mirrorGlobalsOntoWindow = mirrorGlobalsOntoWindow;
  {
    const compileAny = NodeModule.prototype._compile;
    NodeModule.prototype._compile = function (content, filename, ...rest) {
      if (!isProjectSource(filename)) packagesLoadedSinceMirror = true;
      return compileAny.call(this, content, filename, ...rest);
    };
  }
  if (SHARED_UI) {
    const compilePackage = NodeModule.prototype._compile;
    NodeModule.prototype._compile = function (content, filename, ...rest) {
      const result = compilePackage.call(this, content, filename, ...rest);
      if (SHARED_UI.test(filename)) packageModulesPending.push(this);
      return result;
    };
  }
  globalThis.__nodeTestSpike.restoreSharedPackages = () => {
    let restored = 0;
    for (const [target, baseline] of packageBaselines) {
      for (const key of Reflect.ownKeys(target)) {
        if (baseline.has(key)) continue;
        try { delete target[key]; restored += 1; } catch {}
      }
      for (const [key, descriptor] of baseline) {
        const now = Object.getOwnPropertyDescriptor(target, key);
        if (now && now.value === descriptor.value && now.get === descriptor.get && now.set === descriptor.set) continue;
        try { Object.defineProperty(target, key, descriptor); restored += 1; } catch {}
      }
    }
    return restored;
  };
  NodeModule._load = function (...args) {
    if (loadDepth === 0 && trackedLets.size > 0) valuesBeforeLoad = readAll();
    loadDepth += 1;
    try {
      return loadModule.apply(this, args);
    } finally {
      if (packageModulesPending.length > 0 && args[1]?.filename && isProjectSource(args[1].filename)) recordPackageExports();
      loadDepth -= 1;
      if (loadDepth === 0 && packagesLoadedSinceMirror) mirrorGlobalsOntoWindow();
      if (loadDepth === 0 && valuesBeforeLoad) {
        for (const [file, tracked] of trackedLets) {
          const before = valuesBeforeLoad.get(file);
          let now;
          try { now = tracked.read(); } catch { continue; }
          if (!before) { tracked.baseline = now; continue; }
          for (let index = 0; index < now.length; index += 1) {
            if (now[index] !== before[index]) tracked.baseline[index] = now[index];
          }
        }
        valuesBeforeLoad = null;
      }
    }
  };
}
globalThis.__nodeTestSpike.resetLets = () => {
  for (const [file, { baseline, read, write }] of trackedLets) {
    if (process.env.NT_DEBUG_LETS) {
      try {
        const now = read();
        now.forEach((value, index) => { if (value !== baseline[index]) console.error(`[let] ${file.replace(root, "")} #${index}: ${String(value).replace(/\s+/g, " ").slice(0, 60)} -> ${String(baseline[index]).replace(/\s+/g, " ").slice(0, 60)}`); });
      } catch {}
    }
    try { write(baseline); } catch {}
  }
};
if (!process.env.NT_NO_TIMER_CLEAR) trackTimers();
runSetupChain();
initialBootstrap = { ...globalThis.window.MetabaseBootstrap };

// --- shared-realm baseline ----------------------------------------------------
// jest hands every file a fresh jsdom, so a spec that patches document or a DOM
// prototype and never restores it leaks nothing. Here the realm is shared, so the
// descriptors present once the setup chain has run are the baseline, and whatever
// a file changed is put back between files. globalThis only has changed keys
// restored, never added ones removed: a shared module that set a global during
// its one evaluation would otherwise lose it for every later file.
const REALM_OBJECTS = [
  globalThis.document,
  win.Document.prototype,
  win.Node.prototype,
  win.EventTarget.prototype,
  win.Element.prototype,
  win.HTMLElement.prototype,
  win.HTMLCanvasElement.prototype,
  win.HTMLIFrameElement.prototype,
  win.ShadowRoot.prototype,
  win.Range.prototype,
  win.Selection.prototype,
  globalThis.navigator,
].filter(Boolean);
const realmBaseline = new Map();
const snapshotDescriptors = (target) => {
  const descriptors = new Map();
  for (const key of Reflect.ownKeys(target)) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(target, key));
  }
  return descriptors;
};
for (const target of REALM_OBJECTS) realmBaseline.set(target, snapshotDescriptors(target));
const globalBaseline = snapshotDescriptors(globalThis);
const sameDescriptor = (a, b) =>
  a && b && a.value === b.value && a.get === b.get && a.set === b.set &&
  a.writable === b.writable && a.enumerable === b.enumerable && a.configurable === b.configurable;
const restoreDescriptors = (target, descriptors, removeAdded) => {
  let restored = 0;
  if (removeAdded) {
    for (const key of Reflect.ownKeys(target)) {
      if (descriptors.has(key)) continue;
      try { delete target[key]; restored += 1; } catch {}
    }
  }
  for (const [key, descriptor] of descriptors) {
    if (sameDescriptor(Object.getOwnPropertyDescriptor(target, key), descriptor)) continue;
    try { Object.defineProperty(target, key, descriptor); restored += 1; } catch {}
  }
  return restored;
};
const restoreRealm = () => {
  let restored = 0;
  for (const [target, descriptors] of realmBaseline) restored += restoreDescriptors(target, descriptors, true);
  restored += restoreDescriptors(globalThis, globalBaseline, false);
  globalThis.__nodeTestSpike.lastRealmRestored = restored;
  if (process.env.NT_DEBUG_REALM && restored) console.error(`[realm] restored ${restored} after ${currentFile}`);
};
globalThis.__nodeTestSpike.restoreRealm = restoreRealm;
globalThis.__nodeTestSpike.getPhase = () => phase;
globalThis.__nodeTestSpike.resolveProject = resolveProject;
globalThis.__nodeTestSpike.isProjectSource = isProjectSource;
// Measurement only: self time of every module body, summed over the process.
if (process.env.NT_MODULE_TIMES) {
  const NodeModuleForTiming = require("node:module");
  const compile = NodeModuleForTiming.prototype._compile;
  const totals = new Map();
  const stack = [];
  NodeModuleForTiming.prototype._compile = function (content, filename, ...rest) {
    const frame = { child: 0n };
    stack.push(frame);
    const start = process.hrtime.bigint();
    try {
      return compile.call(this, content, filename, ...rest);
    } finally {
      const elapsed = process.hrtime.bigint() - start;
      stack.pop();
      if (stack.length > 0) stack[stack.length - 1].child += elapsed;
      const entry = totals.get(filename) ?? { self: 0n, loads: 0 };
      entry.self += elapsed - frame.child;
      entry.loads += 1;
      totals.set(filename, entry);
    }
  };
  process.on("exit", () => {
    try {
      fs.mkdirSync(process.env.NT_MODULE_TIMES, { recursive: true });
      fs.writeFileSync(path.join(process.env.NT_MODULE_TIMES, `${process.pid}.json`), JSON.stringify([...totals].map(([file, entry]) => [file, Number(entry.self) / 1e6, entry.loads])));
    } catch {}
  });
}
// A spec that registers its own visualization would otherwise collide with the
// next file's registration, since the registry outlives the file.
// dayjs is one instance for the whole process, and the order its plugins are
// installed in changes what format() returns. Loading the app's own entry first
// gives every file the order the app has, whichever spec ran before it.
let resetDayjsLocale = () => {};
if (!process.env.NT_NO_DAYJS_PRELOAD) {
  try {
    // The locale table is on that one instance too. A spec that switches the
    // language or edits a locale would otherwise change date text for every
    // later file, so the table is put back to what the app's entry left.
    const { dayjs } = require("metabase/dayjs");
    const baselineLocale = dayjs.locale();
    const baselineTable = new Map(Object.entries(dayjs.Ls).map(([name, definition]) => [name, { ...definition }]));
    resetDayjsLocale = () => {
      if (process.env.NT_NO_DAYJS_LOCALE_RESET) return;
      for (const [name, definition] of baselineTable) {
        const live = dayjs.Ls[name];
        if (!live) { dayjs.Ls[name] = { ...definition }; continue; }
        for (const key of Object.keys(live)) if (!(key in definition)) delete live[key];
        Object.assign(live, definition);
      }
      if (dayjs.locale() !== baselineLocale) dayjs.locale(baselineLocale);
    };
  } catch {}
}
// The settings singleton is filled from the bootstrap object when its module
// loads, and specs then write into it. jest reloads it for each file. Here its
// contents go back to what a fresh load would hold.
const resetSettings = () => {
  if (process.env.NT_NO_SETTINGS_RESET) return;
  try {
    const settingsFile = resolveProject("metabase/utils/settings", abs("frontend/test/__support__/ui.tsx"));
    const settings = require.cache[settingsFile]?.exports?.default;
    if (!settings?._settings) return;
    for (const key of Object.keys(settings._settings)) delete settings._settings[key];
    Object.assign(settings._settings, initialBootstrap);
  } catch {}
};
// Debug probe: prints which exported objects of project modules a file changed.
const identityIds = new WeakMap();
let nextIdentityId = 0;
const identityOf = (value) => {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return String(value).slice(0, 40);
  if (process.env.NT_DEBUG_STATE_DUMP) {
    if (typeof value === "function") return `fn:${value.name}:${String(value).replace(/\s+/g, " ").slice(0, 50)}`;
    let size = "";
    try { size = value instanceof Map || value instanceof Set ? value.size : Object.keys(value).length; } catch {}
    return `obj:${value.constructor?.name}:${size}`;
  }
  if (!identityIds.has(value)) identityIds.set(value, (nextIdentityId += 1));
  return `#${identityIds.get(value)}`;
};
const fingerprint = (value, depth) => {
  if (value === null || typeof value !== "object" || value.$$typeof) return null;
  const entries = new Map();
  let keys = [];
  try { keys = value instanceof Map ? [...value.keys()].map(String) : value instanceof Set ? [...value].map(identityOf) : Object.keys(value); } catch { return null; }
  if (keys.length > 400) return new Map([["<size>", String(keys.length)]]);
  for (const key of keys) {
    let item;
    try { item = value instanceof Map ? value.get(key) : value instanceof Set ? true : value[key]; } catch { continue; }
    entries.set(key, identityOf(item));
    if (depth > 0 && item && typeof item === "object" && !item.$$typeof && (Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype)) {
      const inner = fingerprint(item, depth - 1);
      if (inner) for (const [innerKey, innerValue] of inner) entries.set(`${key}.${innerKey}`, innerValue);
    }
  }
  return entries;
};
let previousState = null;
const stateDiff = () => {
  const state = new Map();
  for (const [file, cached] of Object.entries(require.cache)) {
    if (!isProjectSource(file) || /\.(spec|test)\.|\/test\/|__support__|\/mocks\//.test(file) || !cached?.loaded) continue;
    let names = [];
    try { names = Object.keys(cached.exports ?? {}); } catch { continue; }
    for (const name of names) {
      let exported;
      try { exported = cached.exports[name]; } catch { continue; }
      const print = fingerprint(exported, 1);
      if (print) state.set(`${file.replace(root, "")}:${name}`, print);
    }
  }
  if (previousState) {
    for (const [key, print] of state) {
      const before = previousState.get(key);
      if (!before) continue;
      const changes = [];
      for (const [prop, value] of print) if (before.get(prop) !== value) changes.push(`${prop}: ${before.get(prop)} -> ${value}`);
      for (const prop of before.keys()) if (!print.has(prop)) changes.push(`${prop}: removed`);
      if (changes.length) console.error(`[state] ${key}\n    ${changes.slice(0, 6).join("\n    ")}${changes.length > 6 ? `\n    (+${changes.length - 6} more)` : ""}`);
    }
  }
  previousState = state;
  return state;
};
globalThis.__nodeTestSpike.dumpState = (file) => {
  previousState = null;
  const state = stateDiff();
  previousState = null;
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries([...state].map(([key, print]) => [key, Object.fromEntries(print)])), null, 1));
};
// Three more things jest resets by giving each file a new environment.
// The translation library is a shared package, so the locale a spec selects
// would stay for every later file.
const resetTranslationLocale = () => {
  if (process.env.NT_NO_LOCALE_RESET) return;
  try { Module.createRequire(abs("frontend/src/index.js"))("ttag").useLocale("en"); } catch {}
};
// One window serves every file, so a spec that navigates leaves its URL behind.
const resetLocation = () => {
  if (process.env.NT_NO_LOCATION_RESET) return;
  try { if (globalThis.window.location.href !== "http://localhost/") dom.reconfigure({ url: "http://localhost/" }); } catch {}
};
// The chart library keeps one canvas context for measuring text. Its methods
// are mocks from jest-canvas-mock, and a spec's resetAllMocks strips their
// implementations for good. Each context's mocks are remembered as it is
// handed out, and their implementations are put back between files.
const canvasMocks = [];
const seenContexts = new WeakSet();
const rememberCanvasContext = (context) => {
  if (context === null || typeof context !== "object" || seenContexts.has(context)) return;
  seenContexts.add(context);
  for (const key of Object.keys(context)) {
    const method = context[key];
    if (typeof method === "function" && method._isMockFunction && method.getMockImplementation()) canvasMocks.push([new WeakRef(method), method.getMockImplementation()]);
  }
};
const wrapCanvasGetContext = () => {
  if (process.env.NT_NO_CANVAS_MOCK_RESTORE) return;
  const prototype = globalThis.window.HTMLCanvasElement.prototype;
  const getContext = prototype.getContext;
  if (typeof getContext !== "function" || getContext.__remembers) return;
  const wrapped = function (...args) {
    const context = getContext.apply(this, args);
    rememberCanvasContext(context);
    return context;
  };
  wrapped.__remembers = true;
  Object.assign(wrapped, getContext);
  prototype.getContext = wrapped;
};
const restoreCanvasMocks = () => {
  let kept = 0;
  for (const entry of canvasMocks) {
    const method = entry[0].deref();
    if (!method) continue;
    if (!method.getMockImplementation()) method.mockImplementation(entry[1]);
    canvasMocks[kept] = entry;
    kept += 1;
  }
  canvasMocks.length = kept;
};
// The unmocked-route check in the setup file's afterEach reads the call
// history. A request that was still in flight when the body finished can reach
// fetch on either side of that check, by a few microtasks, and jest's own hook
// overhead happens to put it after. Here the rule is explicit: an unmatched call
// that reaches fetch after the body has finished is not this test's call.
const AFTER_BODY = new Set(["afterBody", "afterThrow", "afterEach", "between"]);
const patchCallHistory = () => {
  if (process.env.NT_NO_LATE_CALL_RULE) return;
  try {
    const history = require("fetch-mock").default.callHistory;
    if (history.__lateCallRule) return;
    history.__lateCallRule = true;
    const recordCall = history.recordCall.bind(history);
    history.recordCall = (callLog) => { callLog.__arrivedAfterBody = AFTER_BODY.has(phase); return recordCall(callLog); };
    const calls = history.calls.bind(history);
    history.calls = (...args) => calls(...args).filter((log) => log.route || !log.__arrivedAfterBody);
  } catch {}
};
patchCallHistory();
globalThis.__nodeTestSpike.betweenFiles = () => { resetTranslationLocale(); resetLocation(); restoreCanvasMocks(); wrapCanvasGetContext(); };
wrapCanvasGetContext();
let baselineVisualizations = null;
try {
  baselineVisualizations = new Set(require("metabase/viz-core/lib/registry").visualizations.keys());
} catch {}
const resetVisualizations = () => {
  if (!baselineVisualizations) return;
  try {
    const { visualizations } = require("metabase/viz-core/lib/registry");
    for (const key of [...visualizations.keys()]) {
      if (!baselineVisualizations.has(key)) visualizations.delete(key);
    }
  } catch {}
};
globalThis.__nodeTestSpike.resetVisualizations = resetVisualizations;

if (process.env.NT_DEBUG_HOOKS) {
  console.error(`[hooks] root beforeEach=${rootSuite.beforeEach.length} afterEach=${rootSuite.afterEach.length}`);
}
