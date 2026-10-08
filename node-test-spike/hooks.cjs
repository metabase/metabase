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
const transformCached = (file) => transformSource(file, fs.readFileSync(file, "utf8"));
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
// Every file loads the project's modules again, so the same lookups repeat for
// the life of the process. Only hits are kept: a spec may create a file later.
const foundFiles = new Map();
const findFileOnDisk = (base) => {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (fs.existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) if (fs.existsSync(path.join(base, "index" + ext))) return path.join(base, "index" + ext);
  return null;
};
const findFile = (base) => {
  let found = foundFiles.get(base);
  if (found === undefined) {
    found = findFileOnDisk(base);
    if (found) foundFiles.set(base, found);
  }
  return found;
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
  [/\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)(\?url)?$/, () => fileStub],
  [/^cljs\/(.*)$/, (m) => findFile(abs(`target/cljs_dev/${m[1]}`))],
  [/^locales\/(.*)\.json$/, (m) => abs(`frontend/test/__mocks__/locales/${m[1]}.json`)],
  [/^csv-parse\/browser\/esm\/sync$/, () => abs("node_modules/csv-parse/dist/cjs/sync.cjs")],
  [/^csv-stringify\/browser\/esm\/sync$/, () => abs("node_modules/csv-stringify/dist/cjs/sync.cjs")],
  // jest's moduleNameMapper keys are regular expressions without anchors, so
  // they also catch a relative path that ends in one of these names.
  [/sdk-ee-plugins/, () => abs("frontend/src/metabase/plugins/noop.ts")],
  [/sdk-iframe-embedding-ee-plugins|ee-plugins|ee-overrides/, () => abs("frontend/src/metabase/utils/noop.ts")],
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
  mockExports(file) {
    if (!state.mockExports.has(file)) {
      state.mockExports.set(file, mocks.get(file)());
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
  (file.startsWith(abs("frontend/")) || file.startsWith(abs("enterprise/frontend/")) || file.startsWith(abs("e2e/support/")) || file.startsWith(abs("bin/")) || file.startsWith(abs("node-test-spike/")));

// jest's jsdom environment resolves packages with the conditions "require",
// "default" and "browser". Node would use "node" and, for code it takes to be
// a module, "import", and so pick a different build of the same package.
const JEST_CONDITIONS = ["require", "default", "browser"];
// Only a require() is redirected. An import inside a package that is a real ES
// module keeps Node's conditions, because its named imports need a module
// build of what it imports.
const resolveContext = (context) =>
  !context.conditions?.includes("require") ? context : { ...context, conditions: JEST_CONDITIONS };
// jest runs a package file as CommonJS unless the package is on its transform
// list, so a require() that lands on an ES module file of any other package
// fails there with a syntax error. Node can require such a file. The harness
// fails it too, because a spec can depend on a file being unimportable.
const TRANSFORMED_PACKAGES = (() => {
  try { return new RegExp(`^(${require(abs("jest.esm-packages.js")).join("|")})$`); } catch { return null; }
})();
const packageTypes = new Map();
const isModuleFile = (url, packageUrl) => {
  if (/\.mjs(\?|$)/.test(url)) return true;
  if (!/\.js(\?|$)/.test(url)) return false;
  if (!packageTypes.has(packageUrl)) {
    let type = "commonjs";
    try { type = JSON.parse(fs.readFileSync(path.join(fileURLToPath(packageUrl), "package.json"), "utf8")).type ?? "commonjs"; } catch {}
    packageTypes.set(packageUrl, type);
  }
  return packageTypes.get(packageUrl) === "module";
};
let resolvingForMock = 0;
const refuseUntransformedModule = (result, context) => {
  if (!TRANSFORMED_PACKAGES || !context.conditions?.includes("require") || !result.url.includes("/node_modules/")) return;
  const packageMatch = result.url.match(/^(.*node_modules\/(?:\.bun\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+))\//);
  const name = packageMatch?.[2];
  if (!name || TRANSFORMED_PACKAGES.test(name.replace("/", "+"))) return;
  if (result.format !== "module" && !isModuleFile(result.url, packageMatch[1])) return;
  throw new SyntaxError(`Cannot use import statement outside a module (${name} is an ES module that jest does not transform)`);
};
const packageResolutions = new Map();
registerHooks({
  resolve(specifier, context, nextResolve) {
    const parentFile = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL.split("?")[0]) : undefined;
    const projectFile = specifier.startsWith("file:") || specifier.startsWith("node:") ? null : resolveProject(specifier, parentFile);
    let result;
    if (projectFile) {
      result = { url: pathToFileURL(projectFile).href, shortCircuit: true };
    } else {
      const memoKey = !parentFile ? null : `${specifier}\0${path.dirname(parentFile)}\0${context.conditions?.join(",")}\0${JSON.stringify(context.importAttributes ?? {})}`;
      result = memoKey ? packageResolutions.get(memoKey) : undefined;
      if (!result) {
        result = nextResolve(specifier, resolveContext(context));
        if (memoKey) packageResolutions.set(memoKey, { ...result, shortCircuit: true });
      }
    }
    if (!bypassMocks && result.url.startsWith("node:") && mocks.has(result.url)) {
      return { url: pathToFileURL(mockStub(result.url)).href, format: "commonjs", shortCircuit: true };
    }
    if (!bypassMocks && result.url.startsWith("file:")) {
      const file = fileURLToPath(result.url.split("?")[0]);
      if (mocks.has(file)) return { url: pathToFileURL(mockStub(file)).href, format: "commonjs", shortCircuit: true };
    }
    // Only a require from project code: the harness's own packages, jsdom among
    // them, load outside jest's module system and may require anything. A
    // mocked package never loads, and jest.mock itself only asks for its path.
    if (!resolvingForMock && parentFile && isProjectSource(parentFile)) refuseUntransformedModule(result, context);
    return result;
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:")) {
      const file = fileURLToPath(url.split("?")[0]);
      if (isProjectSource(file)) return { format: "commonjs", shortCircuit: true, source: transform(file) };
    }
    const loaded = nextLoad(url, context);
    return loaded;
  },
});

// --- jsdom as the global DOM -----------------------------------------------------
const { JSDOM } = require(bunModule("jsdom").replace(/jsdom@[^/]+/, (m) => m)); 
const createDom = () => new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
// jest gives each file a new jsdom window. So does this, when project code is
// isolated per file. Packages stay loaded, so the few that bind to the window
// when they load are loaded again for each file.
const FRESH_WINDOW = process.env.NT_ISOLATE_ALL === "1" && process.env.NT_FRESH_WINDOW !== "0";
// Of Testing Library only user-event is on the list. The rest binds one thing
// to the window, `screen`, which is pointed at each new document instead.
const WINDOW_BOUND_PACKAGES = process.env.NT_EVICT_PACKAGES ?? (FRESH_WINDOW ? "@testing-library/user-event|jest-canvas-mock|@emotion" : "");
const windowBoundPattern = WINDOW_BOUND_PACKAGES ? new RegExp(`/node_modules/(${WINDOW_BOUND_PACKAGES})/`) : null;
let dom = createDom();
let win = dom.window;
const keep = new Set(["undefined", "globalThis", "window", "self", "global", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "queueMicrotask", "console", "process", "performance", "structuredClone", "crypto", "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "AbortController", "AbortSignal", "fetch", "Request", "Response", "Headers", "Blob", "File", "ReadableStream", "WritableStream", "TransformStream", "constructor"]);
// jest's jsdom environment has no Node fetch. jest-setup.js installs the
// cross-fetch polyfill, which is node-fetch there, and the suite uses jsdom's
// own AbortSignal, Blob, File and FormData. Node's versions are a different
// realm, and jsdom's addEventListener and FileReader reject them.
// Node defines these lazily, and the first touch of any of them loads its
// fetch implementation, which reads AbortSignal. Touch them while Node's
// AbortSignal still exists, or the replacement below fails without a trace.
for (const name of ["fetch", "Request", "Response", "Headers", "FormData", "MessageEvent", "WebSocket", "EventSource", "CloseEvent"]) void globalThis[name];
for (const name of ["AbortController", "AbortSignal", "Blob", "File"]) keep.delete(name);
for (const name of ["fetch", "Request", "Response", "Headers", "FormData", "AbortController", "AbortSignal", "Blob", "File"]) delete globalThis[name];
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
// jest's sandbox global is the jsdom window, and it has none of these Node
// globals. Libraries pick their behaviour from them: React's scheduler uses
// setImmediate when it exists, then MessageChannel, and only then setTimeout,
// which is what it gets under jest.
for (const name of [
  "MessageChannel", "MessagePort",
  "BroadcastChannel", "ByteLengthQueuingStrategy", "CompressionStream", "CountQueuingStrategy", "CryptoKey", "DecompressionStream",
  "PerformanceEntry", "PerformanceMark", "PerformanceMeasure", "PerformanceObserver",
  "PerformanceObserverEntryList", "PerformanceResourceTiming", "ReadableByteStreamController", "ReadableStreamBYOBReader",
  "ReadableStreamBYOBRequest", "ReadableStreamDefaultController", "ReadableStreamDefaultReader", "SubtleCrypto", "TextEncoderStream",
  "TransformStreamDefaultController", "WritableStreamDefaultController", "WritableStreamDefaultWriter",
]) {
  try { delete globalThis[name]; } catch {}
}
// jsdom itself calls setImmediate, from the same global object, so these two
// stay available to the runtime and are hidden from everything else.
const fromRuntime = () => {
  const caller = (new Error().stack ?? "").split("\n")[3] ?? "";
  return caller.includes("/node_modules/jsdom/") || caller.includes("node:") || caller.includes("/node-test-spike/");
};
for (const name of ["setImmediate", "clearImmediate"]) {
  const original = globalThis[name];
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: false,
    get: () => (fromRuntime() ? original : undefined),
    set: (value) => { Object.defineProperty(globalThis, name, { configurable: true, writable: true, enumerable: false, value }); },
  });
}
const windowKeys = new Set();
for (let proto = win; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
  for (const key of Object.getOwnPropertyNames(proto)) windowKeys.add(key);
}
const override = new Set(["Event", "EventTarget", "CustomEvent", "MessageEvent", "ErrorEvent", "KeyboardEvent", "MouseEvent", "FocusEvent", "InputEvent", "UIEvent", "PointerEvent", "DragEvent", "DOMException", "navigator", "location", "history", "localStorage", "sessionStorage", "addEventListener", "removeEventListener", "dispatchEvent", "postMessage", "MutationObserver"]);
// The URL classes and WebSocket are jsdom's under jest. So are atob and btoa, but
// jsdom's are wrappers that call the global ones, which have to stay Node's.
for (const name of ["URL", "URLSearchParams", "WebSocket"]) { keep.delete(name); override.add(name); }
const installedWindowKeys = new Set();
const windowForwarders = {};
const installWindowGlobals = (again) => {
for (const key of windowKeys) {
  if (keep.has(key)) continue;
  if (key in globalThis && !override.has(key) && !(again && installedWindowKeys.has(key))) continue;
  installedWindowKeys.add(key);
  // An event handler property such as window.onkeydown is an accessor on the
  // jsdom window. Copied as a value it would have no setter, and assigning to
  // it would never reach the window, so it is copied as an accessor that
  // forwards there.
  const windowDescriptor = Object.getOwnPropertyDescriptor(win, key);
  if (/^on[a-z]+$/.test(key) && windowDescriptor?.set) {
    try {
      Object.defineProperty(globalThis, key, { configurable: true, enumerable: windowDescriptor.enumerable, get() { return win[key]; }, set(handler) { win[key] = handler; } });
      continue;
    } catch {}
  }
  let value;
  try { value = win[key]; } catch { continue; }
  // With a new window per file, a package that saved a window function when it
  // loaded (Mantine: `const raf = window.requestAnimationFrame`) must still reach
  // the current window, so the global is a forwarder that outlives the window.
  const isMethod = typeof value === "function" && !/^[A-Z]/.test(key);
  if (isMethod && FRESH_WINDOW) windowForwarders[key] ??= function (...args) { return win[key].apply(win, args); };
  const bound = isMethod ? (FRESH_WINDOW ? windowForwarders[key] : value.bind(win)) : value;
  try { Object.defineProperty(globalThis, key, { value: bound, writable: true, configurable: true, enumerable: false }); } catch {}
}
for (const alias of ["window", "self", "top", "parent"]) Object.defineProperty(globalThis, alias, { value: globalThis, configurable: true, writable: true });
for (const timer of ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask"]) {
  Object.defineProperty(win, timer, { get: () => globalThis[timer], configurable: true });
}
};
installWindowGlobals(false);

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
  if (FETCH_MOCK_ABORT_RACE.test(message)) return;
  pendingUncaught ??= error;
});

const realPerformance = require("node:perf_hooks").performance;
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
it.skip = makeTest("skip"); it.only = makeTest("run"); it.todo = (name) => makeTest("todo")(name);
// jest runs a failing test and passes it only when its body throws.
it.failing = (name, fn, timeout) => it(name, async () => {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  if (!threw) throw new Error("Failing test passed even though it was supposed to fail. Remove `.failing` to remove error.");
}, timeout);
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
const packageHookOwners = new WeakMap();
const registeredFromPackage = () => {
  const frames = (new Error().stack ?? "").split("\n").slice(3, 6);
  return frames.length > 0 && frames[0].includes("/node_modules/") ? frames[0] : null;
};
const hook = (kind) => (fn) => {
  const owner = registeredFromPackage();
  if (owner) {
    packageHookOwners.set(fn, owner);
    packageHooks[kind].push(fn);
  }
  else current()[kind].push(fn);
};
Object.assign(globalThis, {
  describe, it, test: it, xit: it.skip, xtest: it.skip, xdescribe: describe.skip, fit: it.only, fdescribe: describe.only,
  beforeAll: hook("beforeAll"), afterAll: hook("afterAll"), beforeEach: hook("beforeEach"), afterEach: hook("afterEach"),
});

let phase = "init";
const runSuite = async (suite, t, outer) => {
  // A hook at the top level of a spec file is in jest's root block, together
  // with the setup files' hooks and after them. Only hooks inside a describe
  // are a nested block, whose afterEach runs before its parent's.
  const afterEach = outer.fileLevel ? [...outer.afterEach, ...suite.afterEach] : [...suite.afterEach, ...outer.afterEach];
  const hooks = { beforeEach: [...outer.beforeEach, ...suite.beforeEach], afterEach };
  for (const fn of suite.beforeAll) await fn();
  for (const child of suite.children) {
    if (child.type === "suite") {
      await t.test(child.suite.name, { skip: child.suite.mode === "skip" }, (t2) => runSuite(child.suite, t2, hooks));
      continue;
    }
    // Once a test has outlived its deadline its body is still running and still
    // writing to the shared registries, so anything after it would be scored
    // against that mess rather than its own behaviour.
    const poisoned = globalThis.__nodeTestSpike.poisoned === true;
    await t.test(child.name, { skip: poisoned || child.mode === "skip", todo: child.mode === "todo", timeout: child.timeout ?? TIMEOUT }, async () => {
      let failure;
      if (actEnvironmentForFile !== undefined) globalThis.IS_REACT_ACT_ENVIRONMENT = actEnvironmentForFile;
      const idleAtStart = process.env.NT_IDLE_LOG ? [realPerformance.eventLoopUtilization(), realPerformance.now()] : null;
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
        for (const fn of hooks.beforeEach) await withDeadline(() => fn(), HOOK_TIMEOUT);
        // node:test puts more turns of the event loop between two tests than
        // jest does. A request that the previous test's cleanup scheduled lands
        // in that gap, before this test has any route, and is recorded as
        // unmatched. It is not this test's request, so it does not count here.
        try {
          const history = require("fetch-mock").default.callHistory;
          if (history.callLogs.some((log) => !log.route)) history.callLogs = history.callLogs.filter((log) => log.route);
        } catch {}
        phase = "body";
        await withDeadline(() => child.fn(), Math.round((child.timeout ?? TIMEOUT) * 0.9));
        phase = "afterBody";
      } catch (error) {
        phase = "afterThrow";
        failure = { error };
        // A timed-out body keeps running. Under a fake clock advancing in real
        // time it also keeps allocating, so drop its timers and hand back the
        // real ones before the next test starts. Any other failure leaves the
        // clock alone, as jest does: a spec may have set it once in beforeAll.
        if (/^test timed out after|^test aborted after/.test(String(error?.message))) {
          try { fakeTimers.clearAllTimers(); } catch {}
          fakeTimers.useRealTimers();
        }
      }
      phase = "afterEach";
      for (const fn of hooks.afterEach) {
        // A hook that never settles would skip every cleanup after it, and the
        // routes and timers it leaves behind fail the following tests instead.
        try { await withDeadline(() => fn(), HOOK_TIMEOUT); } catch (error) { failure ??= { error }; }
      }
      // jest's own afterEach clears the routes, but it flushes first, and a
      // throwing flush would leave them for the next test to collide with.
      try {
        const fetchMock = require("fetch-mock").default;
        fetchMock.removeRoutes();
        fetchMock.callHistory.clear();
        phase = "between";
      } catch {}
      if (usedFakeTimers) {
        usedFakeTimers = false;
        cancelLeftoverFrames();
      }
      if (pendingUncaught) {
        failure ??= { error: pendingUncaught };
        pendingUncaught = undefined;
      }
      if (idleAtStart) {
        const used = realPerformance.eventLoopUtilization(idleAtStart[0]);
        fs.appendFileSync(process.env.NT_IDLE_LOG, `${currentFile}\t${child.name}\t${Math.round(realPerformance.now() - idleAtStart[1])}\t${Math.round(used.idle)}\n`);
      }
      if (failure) {
        if (process.env.NT_FAILURE_DETAIL) fs.appendFileSync(process.env.NT_FAILURE_DETAIL, `\n===== ${currentFile} > ${child.name}\n${String(failure.error?.stack ?? failure.error).slice(0, 40000)}\n`);
        if (process.env.NT_FAILURES) fs.appendFileSync(process.env.NT_FAILURES, `${currentFile}\t${child.name}\t${String(failure.error?.message ?? failure.error).split("\n")[0].slice(0, 200)}\n`);
        throw failure.error;
      }
    });
  }
  for (const fn of suite.afterAll) await fn();
  // node:test keeps every test it ran until the process ends, and with it the
  // callbacks above. Emptied, they no longer hold the spec's functions and,
  // through those, every module the file loaded.
  for (const child of suite.children) child.fn = undefined;
  for (const list of [suite.children, suite.beforeAll, suite.afterAll, suite.beforeEach, suite.afterEach, hooks.beforeEach, hooks.afterEach]) list.length = 0;
};

// A spec may pin document.activeElement with a non-configurable data property,
// which jest discards with its document but a shared one cannot. Keeping such a
// definition configurable is what makes it removable between files.
const originalDefineProperty = Object.defineProperty;
if (!FRESH_WINDOW) {
  Object.defineProperty = function defineProperty(target, key, descriptor) {
    if (key === "activeElement" && target === globalThis.document) {
      return originalDefineProperty(target, key, { ...descriptor, configurable: true });
    }
    return originalDefineProperty(target, key, descriptor);
  };
}

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

const MOCKING_API = /\bjest\.(mock|doMock|unmock|resetModules|isolateModules)\(/;
// Every file gets a fresh registry, which is jest's model on Node's own loader.
const ISOLATE_ALL = process.env.NT_ISOLATE_ALL === "1";
const sharedGlobalKeys = new Set();
let packageLoadDepth = 0;
const CLOCK_GLOBALS = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "Date", "performance", "queueMicrotask"];
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
// A module that stays loaded lists every module it ever required and points
// at the module that first required it. Either link would keep an evicted
// module, and through it the graph of its file, alive.
const releaseEvicted = (evicted) => {
  if (evicted.size === 0) return;
  for (const survivor of [module, require.main, ...Object.values(require.cache)]) {
    if (!survivor) continue;
    if (evicted.has(survivor.parent)) survivor.parent = undefined;
    if (survivor.children?.some((child) => evicted.has(child))) survivor.children = survivor.children.filter((child) => !evicted.has(child));
  }
};
// Testing Library builds `screen` from document.body when it loads. The package
// stays loaded, so its queries are bound again to the body of each new window.
const repointScreen = () => {
  for (const file of Object.keys(require.cache)) {
    if (!file.endsWith("/@testing-library/dom/dist/screen.js")) continue;
    const library = require(path.join(path.dirname(file), "index.js"));
    Object.assign(library.screen, library.getQueriesForElement(globalThis.document.body, library.queries));
  }
};
const evictProjectModules = () => {
  const evicted = new Set();
  for (const file of Object.keys(require.cache)) {
    if (!isEvictable(file)) continue;
    evicted.add(require.cache[file]);
    delete require.cache[file];
  }
  releaseEvicted(evicted);
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
// jsdom fires animation frames every 16 ms of real time, and Redux Toolkit holds
// some store notifications until the next frame. A spec that acts right after a
// request settles passes under jest only because a cold file takes several
// frames to do anything. Files here run about three times faster, so frames do too.
const FRAME_INTERVAL = 1000 / 60;
const FRAME_MS = process.env.NT_FRAME_MS ? Number(process.env.NT_FRAME_MS) : 1;
const trackedTimers = {
  setTimeout: (fn, delay, ...rest) => { const handle = realSetTimeout(fn, delay, ...rest); pendingTimers.add(handle); return handle; },
  setInterval: (fn, delay, ...rest) => { const handle = realSetInterval(fn, delay === FRAME_INTERVAL ? FRAME_MS : delay, ...rest); pendingTimers.add(handle); return handle; },
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
  for (const handle of pendingTimers) {
    try { realClearTimeout(handle); realClearInterval(handle); } catch {}
  }
  pendingTimers.clear();
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
  if (FRESH_WINDOW || !clockIsReal()) return;
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

const fileCleanup = async (isolated) => {
  finishSnapshots();
  // A spy that a file never restores would be undone by the next file's own
  // restoreAllMocks, on top of globals that have been reset since. Spies go
  // first, so the fake clock a spy wrapped is back in place to be uninstalled.
  moduleMocker.restoreAllMocks();
  fakeTimers.useRealTimers();
  restoreTimerGlobals();
  clearPendingTimers();
  trackTimers();
  cancelLeftoverFrames();
  const fetchMock = require("fetch-mock").default;
  try { await fetchMock.callHistory.flush(true); } catch {}
  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();
  document.body.innerHTML = "";
  // jsdom leaves activeElement pointing at a removed node, and userEvent then
  // refuses to focus anything in the next file.
  resetFocus();
  resetNavigator();
  globalThis.__nodeTestSpike.resetVisualizations?.();
  globalThis.__nodeTestSpike.restoreRealm?.();
  globalThis.__nodeTestSpike.restoreEnvironment?.();
  if (FRESH_WINDOW && isolated) {
    const previous = dom;
    dom = createDom();
    win = dom.window;
    installWindowGlobals(true);
    globalThis.__nodeTestSpike.remirror();
    repointScreen();
    if (!process.env.NT_FRESH_WINDOW_KEEP) try { previous.window.close(); } catch {}
  }
  if (windowBoundPattern) {
    const pattern = windowBoundPattern;
    const evicted = new Set();
    for (const cachedFile of Object.keys(require.cache)) {
      if (!pattern.test(cachedFile)) continue;
      evicted.add(require.cache[cachedFile]);
      delete require.cache[cachedFile];
    }
    releaseEvicted(evicted);
    // A package that is loaded again registers its hooks again.
    for (const kind of Object.keys(packageHooks)) packageHooks[kind] = packageHooks[kind].filter((fn) => !pattern.test(packageHookOwners.get(fn) ?? ""));
  }
  globalThis.__nodeTestSpike.restoreSharedPackages?.();
  globalThis.__nodeTestSpike.resetLets?.();
  restoreSetupMocks();
  globalThis.__nodeTestSpike.betweenFiles?.();
  resetDayjsLocale();
  resetSettings();
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
    if (FRESH_WINDOW) { globalThis.__nodeTestSpike.wrapCanvasGetContext(); globalThis.__nodeTestSpike.rebaseline(); }
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
  mockedThisFile = false;
  if (isolated) {
    evictProjectModules();
    globalThis.window.MetabaseBootstrap = { ...initialBootstrap };
    runSetupChain();
  }
  let fileSuite = newSuite(file);
  suiteStack.push(fileSuite);
  try { require(file); } finally { suiteStack.pop(); }
  // A file whose jest.mock calls sit in an imported helper was not isolated at
  // its start, so modules from earlier files have their real dependencies
  // resolved already and would never see these mocks. The file starts again
  // on a fresh registry, with its mocks now known, before any test body runs.
  if (mockedThisFile && !isolated) {
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
      await runSuite(fileSuite, t, { fileLevel: true, beforeEach: [...packageHooks.beforeEach, ...rootSuite.beforeEach], afterEach: [...packageHooks.afterEach, ...rootSuite.afterEach] });
    } finally {
      for (const fn of [...rootSuite.afterAll, ...packageHooks.afterAll]) { try { await fn(); } catch {} }
    }
  } finally {
    if (process.env.NT_FILE_LOG) {
      filesRunHere += 1;
      process.stderr.write(`[file] pid=${process.pid} idx=${filesRunHere} ms=${Date.now() - fileStarted} rss=${Math.round(process.memoryUsage().rss / 1048576)} mods=${Object.keys(require.cache).length} ${currentFile}\n`);
    }
    // A jest.mock reached from an imported helper is invisible to the source scan,
    // so the run's own record decides: a file that mocked gets the isolated cleanup.
    await fileCleanup(isolated || mockedThisFile);
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
      timerLimit: 20000,
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
  resolvingForMock += 1;
  try { return Module.createRequire(from).resolve(id); } finally { resolvingForMock -= 1; }
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
  if (mocks.has(file)) {
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
  if (!file.startsWith("node:")) delete require.cache[file];
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
const setupProcessListeners = [];
let pristineConsole;
const runSetupChain = () => {
  // The setup files register the root hooks each time they run. Without this
  // every isolated file would add another copy for all later tests to run.
  for (const kind of ["beforeAll", "afterAll", "beforeEach", "afterEach"]) rootSuite[kind].length = 0;
  // The same goes for the mocks they install. The old ones also hold the window
  // of the file they were made for, and with it everything that file rendered.
  setupMocks.length = 0;
  // And for the console: a setup file wraps console.error around whatever is
  // there, so each run would add a layer that also keeps the previous run alive.
  if (pristineConsole) restoreDescriptors(console, pristineConsole, true);
  else pristineConsole = new Map(Reflect.ownKeys(console).map((key) => [key, Object.getOwnPropertyDescriptor(console, key)]));
  // And for the listeners they put on the process, which jest hands to each
  // file as a copy of its own.
  for (const [event, listener] of setupProcessListeners.splice(0)) process.removeListener(event, listener);
  const listenersBefore = new Map(process.eventNames().map((event) => [event, new Set(process.rawListeners(event))]));
  setupMocksOpen = true;
  try {
    for (const setupFile of SETUP_CHAIN) require(abs(setupFile));
  } finally {
    for (const event of process.eventNames()) {
      for (const listener of process.rawListeners(event)) if (!listenersBefore.get(event)?.has(listener)) setupProcessListeners.push([event, listener]);
    }
    setupMocksOpen = false;
    for (const mock of setupMocksPending) {
      const implementation = mock.getMockImplementation();
      if (implementation) setupMocks.push([mock, implementation]);
    }
    setupMocksPending = [];
  }
};
const restoreSetupMocks = () => {
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
    { evictProjectModules(); state.mockExports.clear(); globalThis.__nodeTestSpike.clearActualModules?.(); }
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
// With every project module loaded again for each file there is nothing to put
// back, and a tracked module would stay alive after its file.
globalThis.__nodeTestSpike.trackLets = (file, read, write) => { if (!ISOLATE_ALL) trackedLets.set(file, { baseline: read(), read, write }); };
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
    for (const key of Object.getOwnPropertyNames(globalThis)) {
      if (key in win) continue;
      try { Object.defineProperty(win, key, { configurable: true, get: () => globalThis[key], set: (value) => { globalThis[key] = value; } }); } catch {}
    }
  };
  globalThis.__nodeTestSpike.mirrorGlobalsOntoWindow = mirrorGlobalsOntoWindow;
  globalThis.__nodeTestSpike.remirror = () => { packagesLoadedSinceMirror = true; mirrorGlobalsOntoWindow(); };
  {
    const compileAny = NodeModule.prototype._compile;
    NodeModule.prototype._compile = function (content, filename, ...rest) {
      if (isProjectSource(filename)) return compileAny.call(this, content, filename, ...rest);
      packagesLoadedSinceMirror = true;
      // A package or the cljs build loads once per process, so a global that it
      // installs has to outlive the file that happened to load it.
      // A package that loads inside another one's load is covered by the outer
      // comparison.
      const outermost = packageLoadDepth === 0;
      packageLoadDepth += 1;
      const before = outermost ? new Set(Reflect.ownKeys(globalThis)) : null;
      // It also keeps whatever clock functions it reads while it loads
      // (Mantine: `const raf = window.requestAnimationFrame`), so it must not
      // load under a file's fake clock.
      const faked = [];
      if (!clockIsReal()) {
        for (const name of CLOCK_GLOBALS) {
          const real = globalBaseline.get(name);
          const current = Object.getOwnPropertyDescriptor(globalThis, name);
          if (!real || !current || sameDescriptor(current, real)) continue;
          faked.push([name, current]);
          Object.defineProperty(globalThis, name, real);
        }
      }
      try {
        return compileAny.call(this, content, filename, ...rest);
      } finally {
        for (const [name, descriptor] of faked) Object.defineProperty(globalThis, name, descriptor);
        packageLoadDepth -= 1;
        if (before) for (const key of Reflect.ownKeys(globalThis)) if (!before.has(key)) sharedGlobalKeys.add(key);
      }
    };
  }
  if (SHARED_UI) {
    const compilePackage = NodeModule.prototype._compile;
    NodeModule.prototype._compile = function (content, filename, ...rest) {
      const result = compilePackage.call(this, content, filename, ...rest);
      // A package that is loaded again for each file needs no baseline, and one
      // would keep every old copy of it alive.
      if (SHARED_UI.test(filename) && !windowBoundPattern?.test(filename)) packageModulesPending.push(this);
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
    try { write(baseline); } catch {}
  }
};
// React's scheduler keeps the timer functions it finds when it loads. It is one
// copy for the whole process, so it has to find Node's own: a timer of its that
// was tracked would be cleared at the end of a file, and the scheduler would go
// on believing that its callback is still due.
{
  const fromProject = Module.createRequire(abs("frontend/src/index.js"));
  Module.createRequire(fromProject.resolve("react-dom"))("scheduler");
}
trackTimers();
runSetupChain();
initialBootstrap = { ...globalThis.window.MetabaseBootstrap };

// --- shared-realm baseline ----------------------------------------------------
// jest hands every file a fresh jsdom, so a spec that patches document or a DOM
// prototype and never restores it leaks nothing. Here the realm is shared, so the
// descriptors present once the setup chain has run are the baseline, and whatever
// a file changed is put back between files. globalThis only has changed keys
// restored, never added ones removed: a shared module that set a global during
// its one evaluation would otherwise lose it for every later file.
const realmObjects = () => [
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
  // jest gives each file its own console. A spec that assigns a mock to
  // console.warn would otherwise hand its recorded calls to the next file's
  // spyOn, which returns a mock it finds already in place.
  console,
].filter(Boolean);
const realmBaseline = new Map();
const snapshotDescriptors = (target) => {
  const descriptors = new Map();
  for (const key of Reflect.ownKeys(target)) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(target, key));
  }
  return descriptors;
};
for (const target of realmObjects()) realmBaseline.set(target, snapshotDescriptors(target));
const globalBaseline = snapshotDescriptors(globalThis);
globalThis.__nodeTestSpike.rebaseline = () => {
  realmBaseline.clear();
  for (const target of realmObjects()) realmBaseline.set(target, snapshotDescriptors(target));
  globalBaseline.clear();
  for (const [key, descriptor] of snapshotDescriptors(globalThis)) globalBaseline.set(key, descriptor);
};
const sameDescriptor = (a, b) =>
  a && b && a.value === b.value && a.get === b.get && a.set === b.set &&
  a.writable === b.writable && a.enumerable === b.enumerable && a.configurable === b.configurable;
const restoreDescriptors = (target, descriptors, removeAdded, keepAdded) => {
  if (removeAdded) {
    for (const key of Reflect.ownKeys(target)) {
      if (descriptors.has(key) || keepAdded?.has(key)) continue;
      try { delete target[key]; } catch {}
    }
  }
  for (const [key, descriptor] of descriptors) {
    if (sameDescriptor(Object.getOwnPropertyDescriptor(target, key), descriptor)) continue;
    try { Object.defineProperty(target, key, descriptor); } catch {}
  }
};
const restoreRealm = () => {
  for (const [target, descriptors] of realmBaseline) restoreDescriptors(target, descriptors, true);
  restoreDescriptors(globalThis, globalBaseline, ISOLATE_ALL, sharedGlobalKeys);
};
globalThis.__nodeTestSpike.restoreRealm = restoreRealm;
// jest gives each file its own copy of process.env.
const environmentBaseline = { ...process.env };
globalThis.__nodeTestSpike.restoreEnvironment = () => {
  for (const key of Object.keys(process.env)) if (!(key in environmentBaseline)) delete process.env[key];
  for (const [key, value] of Object.entries(environmentBaseline)) if (process.env[key] !== value) process.env[key] = value;
};
// dayjs is one instance for the whole process, and the order its plugins are
// installed in changes what format() returns. Loading the app's own entry first
// gives every file the order the app has, whichever spec ran before it.
let resetDayjsLocale = () => {};
try {
  // The locale table is on that one instance too. A spec that switches the
  // language or edits a locale would otherwise change date text for every
  // later file, so the table is put back to what the app's entry left.
  const { dayjs } = require("metabase/dayjs");
  const baselineLocale = dayjs.locale();
  const baselineTable = new Map(Object.entries(dayjs.Ls).map(([name, definition]) => [name, { ...definition }]));
  resetDayjsLocale = () => {
    for (const [name, definition] of baselineTable) {
      const live = dayjs.Ls[name];
      if (!live) { dayjs.Ls[name] = { ...definition }; continue; }
      for (const key of Object.keys(live)) if (!(key in definition)) delete live[key];
      Object.assign(live, definition);
    }
    if (dayjs.locale() !== baselineLocale) dayjs.locale(baselineLocale);
  };
} catch {}
// The settings singleton is filled from the bootstrap object when its module
// loads, and specs then write into it. jest reloads it for each file. Here its
// contents go back to what a fresh load would hold.
const resetSettings = () => {
  try {
    const settingsFile = resolveProject("metabase/utils/settings", abs("frontend/test/__support__/ui.tsx"));
    const settings = require.cache[settingsFile]?.exports?.default;
    if (!settings?._settings) return;
    for (const key of Object.keys(settings._settings)) delete settings._settings[key];
    Object.assign(settings._settings, initialBootstrap);
  } catch {}
};
// Three more things jest resets by giving each file a new environment.
// The translation library is a shared package, so the locale a spec selects
// would stay for every later file.
const resetTranslationLocale = () => {
  try { Module.createRequire(abs("frontend/src/index.js"))("ttag").useLocale("en"); } catch {}
};
// One window serves every file, so a spec that navigates leaves its URL behind.
const resetLocation = () => {
  if (FRESH_WINDOW) return;
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
// The custom elements registry belongs to the window and has no way to remove
// a definition. A module that defines its elements once, guarded by "if not
// defined yet", would leave every later file with the classes of the first
// file that loaded it. A new window has an empty registry, so empty this one.
const resetCustomElements = () => {
  if (FRESH_WINDOW) return;
  try {
    const { implForWrapper } = require(path.join(bunModule("jsdom"), "lib/jsdom/living/generated/utils.js"));
    const registry = implForWrapper(globalThis.window.customElements);
    registry._customElementDefinitions.length = 0;
    registry._whenDefinedPromiseMap = Object.create(null);
  } catch {}
};
// More of what a new window gives a file under jest, each behind its own switch.
const jsdomUtils = () => require(path.join(bunModule("jsdom"), "lib/jsdom/living/generated/utils.js"));
// Event listeners on the window and the document. Code from an earlier file
// that listens for keys, clicks or focus would still run for every later file.
const listenerTargets = () => [dom.window, dom.window.document, dom.window.document.documentElement, dom.window.document.body];
let baselineListeners = null;
const resetWindowListeners = () => {
  if (FRESH_WINDOW) return;
  try {
    baselineListeners ??= listenerTargets().map(() => ({}));
    listenerTargets().forEach((target, index) => {
      const impl = jsdomUtils().implForWrapper(target);
      if (!impl?._eventListeners) return;
      for (const type of Object.keys(impl._eventListeners)) {
        const kept = baselineListeners[index][type];
        if (kept) impl._eventListeners[type] = [...kept];
        else delete impl._eventListeners[type];
      }
      // React marks a node once it has put its listeners there, and would not
      // put them back after they are removed here.
      for (const key of Object.keys(target)) if (key.startsWith("_reactListening") || key.startsWith("__react")) { try { delete target[key]; } catch {} }
    });
  } catch {}
};
// Storage, cookies, the title, and attributes on <html> and <body>.
const resetWindowData = () => {
  if (FRESH_WINDOW) return;
  try { dom.window.localStorage.clear(); dom.window.sessionStorage.clear(); } catch {}
  try { dom.cookieJar.removeAllCookiesSync(); } catch {}
  try {
    const { document } = dom.window;
    if (document.title !== "") document.title = "";
    for (const element of [document.documentElement, document.body]) {
      for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    }
  } catch {}
};
// React Testing Library's configuration: a spec that calls configure() changes
// it for the one shared copy of the library.
let testingLibraryConfig = null;
const resetTestingLibraryConfig = () => {
  try {
    const library = Module.createRequire(abs("frontend/src/index.js"))("@testing-library/react");
    if (testingLibraryConfig === null) { testingLibraryConfig = { ...library.getConfig() }; return; }
    const current = library.getConfig();
    if (Object.keys(testingLibraryConfig).some((key) => current[key] !== testingLibraryConfig[key])) library.configure({ ...testingLibraryConfig });
  } catch {}
};
resetTestingLibraryConfig();
globalThis.__nodeTestSpike.betweenFiles = () => { resetTranslationLocale(); resetLocation(); restoreCanvasMocks(); wrapCanvasGetContext(); resetCustomElements(); resetWindowListeners(); resetWindowData(); resetTestingLibraryConfig(); };
wrapCanvasGetContext();
globalThis.__nodeTestSpike.wrapCanvasGetContext = wrapCanvasGetContext;
// A spec that registers its own visualization would otherwise collide with the
// next file's registration, since the registry outlives the file.
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

