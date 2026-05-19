// One-shot codemod: rewrite Jest global API to Rstest.
//   - value APIs:  jest.fn() -> rstest.fn()        (rstest is a global)
//   - type APIs:   jest.Mock -> Mock              (named type import added)
// Run: node scripts/rstest-codemod.mjs
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const VALUE_APIS = [
  "advanceTimersByTime", "clearAllMocks", "doMock", "fn", "mocked", "mock",
  "requireActual", "requireMock", "resetAllMocks", "resetModules",
  "restoreAllMocks", "runAllTimers", "runOnlyPendingTimers", "setSystemTime",
  "spyOn", "unmock", "useFakeTimers", "useRealTimers",
];

// jest type identifier -> @rstest/core named type export
const TYPE_MAP = {
  MockedFunction: "MockedFunction",
  MockedFn: "MockedFunction",
  SpyInstance: "MockInstance",
  Mocked: "Mocked",
  Mock: "Mock",
};

const valueRe = new RegExp(`\\bjest\\.(${VALUE_APIS.join("|")})\\b`, "g");
// longest-first so jest.MockedFunction is not partially eaten by jest.Mock
const typeKeys = Object.keys(TYPE_MAP).sort((a, b) => b.length - a.length);
const typeRe = new RegExp(`\\bjest\\.(${typeKeys.join("|")})\\b`, "g");

const files = execSync(
  "git ls-files 'frontend/**/*.ts' 'frontend/**/*.tsx' 'frontend/**/*.js' " +
    "'frontend/**/*.jsx' 'enterprise/frontend/**/*.ts' " +
    "'enterprise/frontend/**/*.tsx' 'enterprise/frontend/**/*.js' " +
    "'enterprise/frontend/**/*.jsx'",
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)
  .split("\n")
  .filter(Boolean);

let changed = 0;
let typeImports = 0;
let funcFiles = [];

for (const file of files) {
  let src = readFileSync(file, "utf8");
  if (!src.includes("jest.")) continue;
  const orig = src;

  if (/\bjest\.Func\b/.test(src)) funcFiles.push(file);

  src = src.replace(valueRe, "rstest.$1");

  const needed = new Set();
  src = src.replace(typeRe, (_m, id) => {
    needed.add(TYPE_MAP[id]);
    return TYPE_MAP[id];
  });

  if (needed.size > 0) {
    // Prepend the type import. import statements hoist, and `import type` is
    // erased at compile time — placement is safe. import/order lint is a
    // separate cleanup concern.
    const imp = `import type { ${[...needed].sort().join(", ")} } from "@rstest/core";\n`;
    src = imp + src;
    typeImports++;
  }

  if (src !== orig) {
    writeFileSync(file, src);
    changed++;
  }
}

console.log(`files changed: ${changed}`);
console.log(`type imports added: ${typeImports}`);
console.log(`jest.Func files (manual): ${funcFiles.join(", ") || "none"}`);
