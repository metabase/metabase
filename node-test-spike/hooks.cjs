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
const transformCached = (file) => {
  const source = fs.readFileSync(file, "utf8");
  return transformSource(file, source) + letTracker(file, source);
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
process.on("exit", () => fs.rmSync(processDir, { recursive: true, force: true }));
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
  [/^(sdk-ee-plugins|sdk-iframe-embedding-ee-plugins|sdk-iframe-embedding-script-ee-plugins|ee-plugins|ee-overrides)$/, () => abs("frontend/src/metabase/utils/noop.ts")],
  [/^docs\/embedding\/sdk\/snippets\//, () => fileStub],
  [/^docs\/(.*)$/, (m) => abs(`docs/${m[1]}`)],
  [/^build-configs\/(.*)$/, (m) => findFile(abs(`frontend/build/${m[1]}`))],
  // jest's jsdom environment resolves with the browser condition, so the suite
  // runs on whatwg-fetch, whose bodies are not single-read streams.
  [/^cross-fetch\/polyfill$/, () => path.join(bunModule("cross-fetch"), "dist/browser-polyfill.js")],
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
  mockExports(file) {
    if (!state.mockExports.has(file)) state.mockExports.set(file, mocks.get(file)());
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
  (file.startsWith(abs("frontend/")) || file.startsWith(abs("enterprise/frontend/")) || file.startsWith(abs("node-test-spike/")));

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parentFile = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL.split("?")[0]) : undefined;
    if (process.env.NT_DEBUG && specifier.startsWith(".")) console.error("[resolve]", specifier, "parentURL=", context.parentURL, "->", parentFile && resolveProject(specifier, parentFile));
    const projectFile = specifier.startsWith("file:") || specifier.startsWith("node:") ? null : resolveProject(specifier, parentFile);
    const result = projectFile ? { url: pathToFileURL(projectFile).href, shortCircuit: true } : nextResolve(specifier, context);
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
const windowKeys = new Set();
for (let proto = win; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
  for (const key of Object.getOwnPropertyNames(proto)) windowKeys.add(key);
}
const override = new Set(["Event", "EventTarget", "CustomEvent", "MessageEvent", "ErrorEvent", "KeyboardEvent", "MouseEvent", "FocusEvent", "InputEvent", "UIEvent", "PointerEvent", "DragEvent", "DOMException", "navigator", "location", "history", "localStorage", "sessionStorage", "addEventListener", "removeEventListener", "dispatchEvent", "postMessage", "MutationObserver"]);
for (const key of windowKeys) {
  if (keep.has(key)) continue;
  if (key in globalThis && !override.has(key)) continue;
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
const hook = (kind) => (fn) => { current()[kind].push(fn); };
Object.assign(globalThis, {
  describe, it, test: it, xit: it.skip, xtest: it.skip, xdescribe: describe.skip, fit: it.only, fdescribe: describe.only,
  beforeAll: hook("beforeAll"), afterAll: hook("afterAll"), beforeEach: hook("beforeEach"), afterEach: hook("afterEach"),
});

let phase = "init";
const { AsyncLocalStorage } = require("node:async_hooks");
const originStore = new AsyncLocalStorage();
const runTagged = (tag, fn) => originStore.run(tag, fn);
const hookTag = (kind, index, fn) => `${kind}#${index}:${String(fn).replace(/\s+/g, " ").slice(0, 70)}`;
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
      // A request dispatched by the body's last render is still walking the
      // api client's handler chain when the body's promise settles. jest reaches
      // its afterEach several promise hops later than this loop does, so give
      // that chain one macrotask to reach fetch while the routes still exist.
      if (!process.env.NT_NO_SETTLE_TURN) await new Promise((resolve) => realSetTimeout(resolve, 0));
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
const SETUP_CHAIN = [
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
const EVICTABLE_PACKAGES = /\/node_modules\/(@mantine|@emotion)\//;
const isEvictable = (file) => isProjectSource(file) || EVICTABLE_PACKAGES.test(file);
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
const trackTimers = () => {
  for (const name of ["setTimeout", "setInterval"]) {
    const original = name === "setTimeout" ? realSetTimeout : realSetInterval;
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: (fn, delay, ...rest) => {
        const handle = original(fn, delay, ...rest);
        pendingTimers.add(handle);
        return handle;
      },
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
  if (process.env.NT_NO_FRAME_RESET || globalThis.setInterval !== realSetInterval) return;
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
  globalThis.__nodeTestSpike.resetLets?.();
  restoreSetupMocks();
  resetDayjsLocale();
  resetSettings();
  timerShape("after-realm");
  if (isolated) {
    mocks.clear();
    for (const [key, factory] of preloadMocks) mocks.set(key, factory);
    state.mockExports.clear();
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
    await runSuite(fileSuite, t, { beforeEach: rootSuite.beforeEach, afterEach: rootSuite.afterEach });
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
  const project = resolveProject(id, from);
  if (project) return project;
  return Module.createRequire(from).resolve(id);
};
const requireActual = (id) => {
  const from = callerFile();
  const file = resolveFrom(id, from);
  bypassMocks += 1;
  try { return Module.createRequire(from)(file); } finally { bypassMocks -= 1; }
};
const jestMock = (id, factory) => {
  const from = callerFile();
  const file = resolveFrom(id, from);
  const manualMock = path.join(path.dirname(file), "__mocks__", path.basename(file));
  if (factory) mocks.set(file, factory);
  else if (findFile(manualMock.replace(/\.[jt]sx?$/, ""))) mocks.set(file, () => Module.createRequire(from)(findFile(manualMock.replace(/\.[jt]sx?$/, ""))));
  else mocks.set(file, () => { bypassMocks += 1; try { return moduleMocker.generateFromMetadata(moduleMocker.getMetadata(Module.createRequire(from)(file))); } finally { bypassMocks -= 1; } });
  state.mockExports.delete(file);
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
  requireMock: (id) => Module.createRequire(callerFile())(resolveFrom(id, callerFile())),
  resetModules: () => globalThis.jest,
  isolateModules: (fn) => fn(),
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
  NodeModule._load = function (...args) {
    if (loadDepth === 0 && trackedLets.size > 0) valuesBeforeLoad = readAll();
    loadDepth += 1;
    try {
      return loadModule.apply(this, args);
    } finally {
      loadDepth -= 1;
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
  if (process.env.NT_DEBUG_REALM && restored) console.error(`[realm] restored ${restored} after ${currentFile}`);
};
globalThis.__nodeTestSpike.restoreRealm = restoreRealm;
globalThis.__nodeTestSpike.getPhase = () => phase;
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
