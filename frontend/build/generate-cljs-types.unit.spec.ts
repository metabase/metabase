import fs from "node:fs";
import path from "node:path";

import {
  entryModuleName,
  mungeName,
  parseEntries,
  renderDeclarations,
  scanEntryExports,
  scanExportNames,
} from "./generate-cljs-types";

const REPO_ROOT = path.join(__dirname, "../..");
const COMPILED_DIR = "target/cljs_dev";
const SOURCE_DIRS = ["src", "enterprise/backend/src"];
const FILE_NAME = "src/metabase/lib/example.cljc";
const HEADER =
  "// Generated from the cljs source by `bun run generate:cljs-types`. Don't edit it.";

interface SourceMap {
  sources: string[];
  sourcesContent: string[];
}

function scan(...lines: string[]): string[] {
  return scanExportNames(lines.join("\n"), FILE_NAME);
}

function readRepoFile(repoPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, repoPath), "utf8");
}

function readCompiledModuleNames(): string[] {
  return fs
    .readdirSync(path.join(REPO_ROOT, COMPILED_DIR))
    .filter((fileName) => fileName.endsWith(".js"))
    .map((fileName) => fileName.slice(0, -".js".length));
}

function readCompiledExportNames(moduleName: string): string[] {
  const compiledSource = readRepoFile(`${COMPILED_DIR}/${moduleName}.js`);
  return Array.from(
    compiledSource.matchAll(
      /Object\.defineProperty\(module\.exports, "([^"]+)"/g,
    ),
    ([, name]) => name,
  ).sort();
}

function findSourcePath(moduleName: string): string | undefined {
  const basePath = `src/${moduleName.replaceAll(".", "/")}`;
  return [`${basePath}.cljs`, `${basePath}.cljc`].find((sourcePath) =>
    fs.existsSync(path.join(REPO_ROOT, sourcePath)),
  );
}

function scanSourceMapExports(moduleName: string): string[] {
  const sourceMap: SourceMap = JSON.parse(
    readRepoFile(`${COMPILED_DIR}/${moduleName}.js.map`),
  );
  return scanExportNames(sourceMap.sourcesContent[0], sourceMap.sources[0]);
}

function scanModuleSource(
  moduleName: string,
  hasCompiledExports: boolean,
): string[] | undefined {
  const sourcePath = findSourcePath(moduleName);
  if (sourcePath !== undefined) {
    return scanExportNames(readRepoFile(sourcePath), sourcePath);
  }
  return hasCompiledExports ? scanSourceMapExports(moduleName) : undefined;
}

function listSourcePaths(): string[] {
  return SOURCE_DIRS.flatMap((sourceDir) =>
    fs
      .readdirSync(path.join(REPO_ROOT, sourceDir), {
        recursive: true,
        encoding: "utf8",
      })
      .filter((fileName) => /\.clj[cs]$/.test(fileName))
      .map((fileName) => `${sourceDir}/${fileName}`),
  );
}

describe("mungeName", () => {
  it.each([
    ["query=", "query_EQ_"],
    ["string?", "string_QMARK_"],
    ["legacy-column->metadata", "legacy_column__GT_metadata"],
    ["swap!", "swap_BANG_"],
    ["delete", "delete$"],
    ["isURL", "isURL"],
  ])("should munge %s to %s", (name, mungedName) => {
    expect(mungeName(name)).toBe(mungedName);
  });
});

describe("parseEntries", () => {
  it("should return the :app entries with their lines and skip commented-out and discarded entries", () => {
    const shadowConfig = [
      "{:builds",
      " {:app",
      "  {:target  :npm-module",
      "   :entries ^:pinned [metabase.lib.js,",
      "             ;; metabase.lib.limit [not built]",
      "             #_metabase.lib.drill-thru",
      "             metabase.xrays.domain-entities.queries.util,]}",
      "  :test {:entries [metabase.lib.js-test]}}}",
    ].join("\n");

    expect(parseEntries(shadowConfig)).toEqual([
      { namespace: "metabase.lib.js", line: 4 },
      { namespace: "metabase.xrays.domain-entities.queries.util", line: 7 },
    ]);
  });

  it("should fail when there are no :app entries", () => {
    expect(() => parseEntries("{:builds {:test {:entries []}}}")).toThrow(
      "shadow-cljs.edn: expected a vector at :builds :app :entries.",
    );
  });
});

describe("scanExportNames", () => {
  it("should return the sorted, munged names of the exported def forms", () => {
    expect(
      scan(
        "(ns metabase.lib.example)",
        "",
        "(defn ^:export query= [a b] (= a b))",
        "",
        "#?(:cljs",
        "   (mu/defn ^:export current-limit :- [:maybe nat-int?]",
        "     [query]",
        "     nil))",
        "",
        "(def ^:export ^:const default-limit 2000)",
        "(defn ^:private ^:export ^js string-like? [x] x)",
        ";; (defn ^:export commented-out [] nil)",
        "(defn not-exported [] nil)",
      ),
    ).toEqual([
      "current_limit",
      "default_limit",
      "query_EQ_",
      "string_like_QMARK_",
    ]);
  });

  it.each([
    ["a #_ discard", ["#_(defn ^:export ghost [] 1)"]],
    ["a #_ discard of a later line", ["#_", "", "(def ^:export ghost 1)"]],
    ["a comment form", ["(comment", "  (defn ^:export ghost [] 1))"]],
    ["a comment form inside do", ["(do (comment (def ^:export ghost 1)))"]],
    [
      "the :clj branch of a reader conditional",
      ["#?(:clj (defn ^:export ghost [] 1))"],
    ],
    ["the :clj branch of #?@", ["#?@(:clj [(def ^:export ghost 1)])"]],
    ["a string", ['(def not-exported "(defn ^:export ghost [] 1)")']],
    ["a line comment", ["(def not-exported 1) ; (def ^:export ghost 1)"]],
    ["{:export false} metadata", ["(def ^{:export false} ghost 1)"]],
    ["{:export nil} metadata", ["(def ^{:export nil} ghost 1)"]],
  ])("should not export a definition in %s", (_description, lines) => {
    expect(scan(...lines)).toEqual([]);
  });

  it("should discard one form for each #_", () => {
    expect(
      scan(
        "#_ #_ (def ^:export first-ghost 1) (def ^:export second-ghost 2)",
        "(def ^:export kept 3)",
      ),
    ).toEqual(["kept"]);
  });

  it.each([
    [
      "#?(:clj (def ^:export a 1) :cljs (def ^:export b 1) :default (def ^:export c 1))",
      "b",
    ],
    [
      "#?(:cljs-release (def ^:export a 1) :cljs-dev (def ^:export d 1) :cljs (def ^:export e 1))",
      "d",
    ],
    ["#?(:clj (def ^:export a 1) :default (def ^:export f 1))", "f"],
    ["(def ^:export #?(:clj clj-name :cljs cljs-name) 1)", "cljs_name"],
  ])(
    "should keep the first :cljs, :cljs-dev or :default branch of %s",
    (source, name) => {
      expect(scan(source)).toEqual([name]);
    },
  );

  it("should splice the kept branch of #?@", () => {
    expect(
      scan(
        "#?@(:clj [(def ^:export a 1)]",
        "    :cljs [(def ^:export b 1)",
        "           (def ^:export c 1)])",
      ),
    ).toEqual(["b", "c"]);
  });

  it("should export definitions marked in map metadata, an attr-map or with the name on the next line", () => {
    expect(
      scan(
        "(def ^{:export true} a 1)",
        '(defn ^{:doc "B." :export true} b [] 1)',
        "(defn ^:export",
        "  c [] 1)",
        '(defn d "D." {:export true} [] 1)',
        '(mu/defn e :- :int "E." {:export true} [] 1)',
        "(defmulti f {:export true} identity)",
      ),
    ).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("should export private definitions, defonce and namespaced defn forms", () => {
    expect(
      scan(
        "(defn- ^:export a [] 1)",
        "(defonce ^:export b (atom nil))",
        "(mu/defn- ^:export c :- :int [] 1)",
        "(def ^:private ^:export d 1)",
      ),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("should let outer metadata override inner metadata", () => {
    expect(
      scan(
        "(def ^{:export false} ^:export a 1)",
        "(def ^:export ^{:export false} b 1)",
      ),
    ).toEqual(["b"]);
  });

  it("should export definitions nested in do", () => {
    expect(
      scan("(do (def ^:export a 1)", "    (do (defn ^:export b [] 1)))"),
    ).toEqual(["a", "b"]);
  });

  it("should export the :export-as name unmunged", () => {
    expect(scan('(defn ^{:export-as "renamedFn"} some-fn [] 1)')).toEqual([
      "renamedFn",
    ]);
  });

  it("should read strings, character literals and regexes that contain brackets", () => {
    expect(
      scan(
        '(def a "(\\")")',
        '(def b [\\( \\) \\[ \\" \\\\ \\; \\newline \\u1234])',
        '(def c #"\\(+[)]\\"")',
        "(def ^:export d (str \\) #{} #(inc %) @e 'f `g ~h ~@i #'j))",
        "(def ^:export k #js {:l ##Inf :m #:n{:o 1}})",
      ),
    ).toEqual(["d", "k"]);
  });

  it.each([
    [
      "an unclosed form",
      ["(ns example)", "(defn ^:export foo [] (bar)"],
      `${FILE_NAME}:2: expected ")" to close this "(", found the end of the file`,
    ],
    [
      "a mismatched bracket",
      ["(defn foo", "  [}"],
      `${FILE_NAME}:2: expected "]" to close the "[" on line 2, found "}"`,
    ],
    [
      "an unmatched closing bracket",
      ["(def a 1)", "(def b 2))"],
      `${FILE_NAME}:2: expected a form, found an unmatched ")"`,
    ],
    [
      "an unclosed string",
      ['(def a "unclosed)'],
      `${FILE_NAME}:1: expected a closing " for this string, found the end of the file`,
    ],
    [
      "a reader conditional without a list",
      ["#?[:cljs 1]"],
      `${FILE_NAME}:1: expected "(" after "#?"`,
    ],
    [
      "^:export on a form it doesn't recognise",
      ["(ns example)", "(defexport ^:export foo [] 1)"],
      `${FILE_NAME}:2: expected :export only on the name of a def, defn, defn-, defonce or defmulti form at the top level or inside do.`,
    ],
    [
      "^:export on a definition nested in another form",
      ["(when true", "  (def ^:export foo 1))"],
      `${FILE_NAME}:2: expected :export only on the name`,
    ],
  ])(
    "should fail naming the file and line for %s",
    (_description, lines, message) => {
      expect(() => scan(...lines)).toThrow(message);
    },
  );

  it("should read every cljs and cljc file under the source directories", () => {
    const sourcePaths = listSourcePaths();

    expect(sourcePaths.length).toBeGreaterThan(0);
    sourcePaths.forEach((sourcePath) => {
      expect(() =>
        scanExportNames(readRepoFile(sourcePath), sourcePath),
      ).not.toThrow();
    });
  });
});

describe("renderDeclarations", () => {
  it("should declare each export as any", () => {
    expect(renderDeclarations(["current_limit", "limit"])).toBe(
      [
        HEADER,
        "export const current_limit: any;",
        "export const limit: any;",
        "",
      ].join("\n"),
    );
  });

  it("should render an empty module for a namespace without exports", () => {
    expect(renderDeclarations([])).toBe([HEADER, "export {};", ""].join("\n"));
  });
});

describe("the cljs build", () => {
  const entries = parseEntries(readRepoFile("shadow-cljs.edn"));

  beforeAll(() => {
    if (!fs.existsSync(path.join(REPO_ROOT, COMPILED_DIR, "cljs.core.js"))) {
      throw new Error(
        `This test needs a cljs build, and ${COMPILED_DIR} is missing. Run \`bun run build-pure:cljs\` first.`,
      );
    }
  });

  it.each(entries)(
    "should have the scanned exports of the entry $namespace",
    (entry) => {
      expect(scanEntryExports(entry)).toEqual(
        readCompiledExportNames(entryModuleName(entry.namespace)),
      );
    },
  );

  it("should have the scanned exports of every other compiled namespace with a source under src or with exports", () => {
    const entryModuleNames = new Set(
      entries.map(({ namespace }) => entryModuleName(namespace)),
    );
    const scannedNamesByModule: Record<string, string[]> = {};
    const compiledNamesByModule: Record<string, string[]> = {};
    readCompiledModuleNames()
      .filter((moduleName) => !entryModuleNames.has(moduleName))
      .forEach((moduleName) => {
        const compiledNames = readCompiledExportNames(moduleName);
        const scannedNames = scanModuleSource(
          moduleName,
          compiledNames.length > 0,
        );
        if (scannedNames !== undefined) {
          scannedNamesByModule[moduleName] = scannedNames;
          compiledNamesByModule[moduleName] = compiledNames;
        }
      });

    expect(scannedNamesByModule).toEqual(compiledNamesByModule);
  });
});
