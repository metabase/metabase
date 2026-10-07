import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(__dirname, "../..");
const TYPES_DIR = "frontend/src/types/cljs";
const HEADER =
  "// Generated from the cljs source by `bun run generate:cljs-types`. Don't edit it.";

const CHAR_MAP = new Map([
  ["-", "_"],
  [":", "_COLON_"],
  ["+", "_PLUS_"],
  [">", "_GT_"],
  ["<", "_LT_"],
  ["=", "_EQ_"],
  ["~", "_TILDE_"],
  ["!", "_BANG_"],
  ["@", "_CIRCA_"],
  ["#", "_SHARP_"],
  ["'", "_SINGLEQUOTE_"],
  ['"', "_DOUBLEQUOTE_"],
  ["%", "_PERCENT_"],
  ["^", "_CARET_"],
  ["&", "_AMPERSAND_"],
  ["*", "_STAR_"],
  ["|", "_BAR_"],
  ["{", "_LBRACE_"],
  ["}", "_RBRACE_"],
  ["[", "_LBRACK_"],
  ["]", "_RBRACK_"],
  ["/", "_SLASH_"],
  ["\\", "_BSLASH_"],
  ["?", "_QMARK_"],
]);

const JS_RESERVED = new Set(
  `abstract arguments await boolean break byte case catch char class const
  constructor continue debugger default delete do double else enum export
  extends final finally float for function goto if implements import in
  instanceof int interface let long methods native new null package private
  protected public return short static super switch synchronized this throw
  throws transient try typeof var void volatile while with yield`.split(/\s+/),
);

const KEPT_FEATURES = new Set([":cljs", ":cljs-dev", ":default"]);
const DEFINITION_HEADS = new Set([
  "def",
  "defn",
  "defn-",
  "defonce",
  "defmulti",
]);
const ATTR_MAP_HEADS = new Set(["defn", "defn-", "defmulti"]);
const CLOSERS = new Set([")", "]", "}"]);

const SKIPPED = /(?:[\s,]+|;[^\n]*|#![^\n]*)*/y;
const TOKEN = /[^\s,";@^`~()[\]{}\\]+/y;
const STRING_TAIL = /(?:[^"\\]|\\[\s\S])*"/y;
const NUMBER = /^[+-]?\d/;

type FormKind =
  | "list"
  | "vector"
  | "map"
  | "set"
  | "symbol"
  | "keyword"
  | "string"
  | "atom";

interface Form {
  kind: FormKind;
  text: string;
  children: Form[];
  meta: ReadonlyMap<string, Form>;
  offset: number;
}

interface Definition {
  name: Form;
  meta: ReadonlyMap<string, Form>;
}

export interface ShadowEntry {
  namespace: string;
  line: number;
}

function createForm(
  kind: FormKind,
  text: string,
  offset: number,
  children: Form[] = [],
): Form {
  return { kind, text, children, meta: new Map(), offset };
}

const TRUE = createForm("symbol", "true", 0);

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function pairs(forms: readonly Form[]): [Form, Form][] {
  return Array.from({ length: forms.length / 2 }, (_, index) => [
    forms[2 * index],
    forms[2 * index + 1],
  ]);
}

function mapGet(map: Form, key: string): Form | undefined {
  return map.kind === "map"
    ? pairs(map.children).find(
        ([k]) => k.kind === "keyword" && k.text === key,
      )?.[1]
    : undefined;
}

function metaEntries(meta: Form): [string, Form][] {
  switch (meta.kind) {
    case "keyword":
      return [[meta.text, TRUE]];
    case "map":
      return pairs(meta.children).map(([key, value]) => [key.text, value]);
    default:
      return [[":tag", meta]];
  }
}

class FormReader {
  private offset = 0;

  constructor(
    private readonly source: string,
    private readonly fileName: string,
  ) {}

  readAll(): Form[] {
    return this.readChildren("", "", 0);
  }

  private error(offset: number, message: string): Error {
    return new Error(
      `${this.fileName}:${lineAt(this.source, offset)}: ${message}`,
    );
  }

  private skip() {
    SKIPPED.lastIndex = this.offset;
    SKIPPED.exec(this.source);
    this.offset = SKIPPED.lastIndex;
  }

  private readChildren(opener: string, closer: string, start: number): Form[] {
    const children: Form[] = [];
    for (;;) {
      this.skip();
      const char = this.source.charAt(this.offset);
      if (char === closer) {
        this.offset++;
        return children;
      }
      if (char === "") {
        throw this.error(
          start,
          `expected "${closer}" to close this "${opener}", found the end of the file`,
        );
      }
      if (CLOSERS.has(char)) {
        throw this.error(
          this.offset,
          opener === ""
            ? `expected a form, found an unmatched "${char}"`
            : `expected "${closer}" to close the "${opener}" on line ${lineAt(this.source, start)}, found "${char}"`,
        );
      }
      children.push(...this.read());
    }
  }

  private readOne(after: string): Form {
    for (;;) {
      this.skip();
      const char = this.source.charAt(this.offset);
      if (char === "" || CLOSERS.has(char)) {
        throw this.error(
          this.offset,
          `expected a form after "${after}", found ${char === "" ? "the end of the file" : `"${char}"`}`,
        );
      }
      const start = this.offset;
      const forms = this.read();
      if (forms.length > 1) {
        throw this.error(
          start,
          `expected one form after "${after}", found a #?@ splice`,
        );
      }
      if (forms.length === 1) {
        return forms[0];
      }
    }
  }

  private read(): Form[] {
    const start = this.offset;
    const char = this.source.charAt(this.offset++);
    switch (char) {
      case "(":
        return [this.collection("list", "(", ")", start)];
      case "[":
        return [this.collection("vector", "[", "]", start)];
      case "{":
        return [this.collection("map", "{", "}", start)];
      case '"':
        return [this.string("string", start)];
      case "\\":
        return [this.character(start)];
      case "^":
        return [this.withMeta()];
      case "#":
        return this.dispatch(start);
      case "~":
        this.offset += this.source.startsWith("@", this.offset) ? 1 : 0;
        return [this.readOne(char)];
      case "'":
      case "`":
      case "@":
        return [this.readOne(char)];
      default:
        this.offset = start;
        return [this.token()];
    }
  }

  private dispatch(start: number): Form[] {
    const char = this.source.charAt(this.offset++);
    switch (char) {
      case "_":
        this.readOne("#_");
        return [];
      case "?":
        return this.conditional(start);
      case '"':
        return [this.string("atom", start)];
      case "{":
        return [this.collection("set", "#{", "}", start)];
      case "(":
        return [this.collection("list", "#(", ")", start)];
      case "^":
        return [this.withMeta()];
      case "#":
        return [this.token()];
      case "'":
      case "=":
        return [this.readOne(`#${char}`)];
      default: {
        this.offset = start + 1;
        const tag = this.token();
        if (tag.text === "") {
          throw this.error(
            start,
            `expected a form after "#", found "#${char}"`,
          );
        }
        return [this.readOne(`#${tag.text}`)];
      }
    }
  }

  private conditional(start: number): Form[] {
    const splicing = this.source.startsWith("@", this.offset);
    const opener = splicing ? "#?@(" : "#?(";
    this.offset += splicing ? 1 : 0;
    this.skip();
    if (!this.source.startsWith("(", this.offset)) {
      throw this.error(start, `expected "(" after "${opener.slice(0, -1)}"`);
    }
    this.offset++;
    const branches = this.readChildren(opener, ")", start);
    if (branches.length % 2 !== 0) {
      throw this.error(
        start,
        `expected pairs of a feature and a form in this "${opener}"`,
      );
    }
    const kept = pairs(branches).find(
      ([feature]) =>
        feature.kind === "keyword" && KEPT_FEATURES.has(feature.text),
    )?.[1];
    if (kept === undefined || !splicing) {
      return kept ? [kept] : [];
    }
    if (kept.kind !== "list" && kept.kind !== "vector") {
      throw this.error(
        kept.offset,
        `expected a list or vector to splice from this "${opener}"`,
      );
    }
    return kept.children;
  }

  private withMeta(): Form {
    const meta = this.readOne("^");
    const target = this.readOne("^");
    return { ...target, meta: new Map([...target.meta, ...metaEntries(meta)]) };
  }

  private collection(
    kind: FormKind,
    opener: string,
    closer: string,
    start: number,
  ): Form {
    const children = this.readChildren(opener, closer, start);
    if (kind === "map" && children.length % 2 !== 0) {
      throw this.error(start, "expected an even number of forms in this map");
    }
    return createForm(kind, "", start, children);
  }

  private string(kind: "string" | "atom", start: number): Form {
    STRING_TAIL.lastIndex = this.offset;
    const tail = STRING_TAIL.exec(this.source)?.[0];
    if (tail === undefined) {
      throw this.error(
        start,
        'expected a closing " for this string, found the end of the file',
      );
    }
    const textStart = this.offset;
    this.offset += tail.length;
    return createForm(
      kind,
      this.source.slice(textStart, this.offset - 1),
      start,
    );
  }

  private character(start: number): Form {
    TOKEN.lastIndex = this.offset;
    this.offset += TOKEN.exec(this.source)?.[0].length ?? 1;
    if (this.offset > this.source.length) {
      throw this.error(
        start,
        'expected a character after "\\", found the end of the file',
      );
    }
    return createForm("atom", this.source.slice(start, this.offset), start);
  }

  private token(): Form {
    const start = this.offset;
    TOKEN.lastIndex = start;
    const text = TOKEN.exec(this.source)?.[0] ?? "";
    this.offset += text.length;
    return createForm(tokenKind(text), text, start);
  }
}

function tokenKind(text: string): FormKind {
  if (text.startsWith(":")) {
    return "keyword";
  }
  return NUMBER.test(text) ? "atom" : "symbol";
}

function isTruthy(form: Form | undefined): boolean {
  return (
    form !== undefined &&
    !(form.kind === "symbol" && (form.text === "nil" || form.text === "false"))
  );
}

function exportName(
  name: string,
  meta: ReadonlyMap<string, Form>,
): string | undefined {
  const exportAs = meta.get(":export-as");
  if (exportAs?.kind === "string") {
    return exportAs.text;
  }
  return isTruthy(meta.get(":export")) ? mungeName(name) : undefined;
}

function headOf(form: Form): string | undefined {
  const [head] = form.children;
  return form.kind === "list" && head?.kind === "symbol"
    ? head.text.replace(/^[^/]+\//, "")
    : undefined;
}

function attrMapEntries(formsAfterName: readonly Form[]): [string, Form][] {
  const [first] = formsAfterName;
  const afterSchema =
    first?.kind === "keyword" && first.text === ":-"
      ? formsAfterName.slice(2)
      : formsAfterName;
  const afterDocstring =
    afterSchema[0]?.kind === "string" ? afterSchema.slice(1) : afterSchema;
  return afterDocstring[0]?.kind === "map"
    ? metaEntries(afterDocstring[0])
    : [];
}

function definitionOf(form: Form): Definition | undefined {
  const head = headOf(form);
  const [, name, ...formsAfterName] = form.children;
  if (
    head === undefined ||
    !DEFINITION_HEADS.has(head) ||
    name?.kind !== "symbol"
  ) {
    return undefined;
  }
  const attrMap = ATTR_MAP_HEADS.has(head)
    ? attrMapEntries(formsAfterName)
    : [];
  return { name, meta: new Map([...name.meta, ...attrMap]) };
}

function topLevelDefinitions(forms: readonly Form[]): Definition[] {
  return forms.flatMap((form) => {
    if (headOf(form) === "do") {
      return topLevelDefinitions(form.children.slice(1));
    }
    return definitionOf(form) ?? [];
  });
}

function findMisplacedExport(
  forms: readonly Form[],
  definitionNames: ReadonlySet<Form>,
): Form | undefined {
  for (const form of forms) {
    if (headOf(form) === "comment") {
      continue;
    }
    if (
      !definitionNames.has(form) &&
      exportName(form.text, form.meta) !== undefined
    ) {
      return form;
    }
    const nested = findMisplacedExport(form.children, definitionNames);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

export function parseEntries(shadowConfig: string): ShadowEntry[] {
  const [config] = new FormReader(shadowConfig, "shadow-cljs.edn").readAll();
  const entries = [":builds", ":app", ":entries"].reduce<Form | undefined>(
    (form, key) => (form === undefined ? undefined : mapGet(form, key)),
    config,
  );
  if (entries?.kind !== "vector") {
    throw new Error(
      "shadow-cljs.edn: expected a vector at :builds :app :entries.",
    );
  }
  return entries.children.map((entry) => {
    const line = lineAt(shadowConfig, entry.offset);
    if (entry.kind !== "symbol") {
      throw new Error(
        `shadow-cljs.edn:${line}: expected a namespace symbol in :entries.`,
      );
    }
    return { namespace: entry.text, line };
  });
}

export function entryModuleName(namespace: string): string {
  return namespace.replaceAll("-", "_");
}

export function mungeName(name: string): string {
  const unreserved = JS_RESERVED.has(name) ? `${name}$` : name;
  return Array.from(unreserved, (char) => CHAR_MAP.get(char) ?? char).join("");
}

export function scanExportNames(source: string, fileName: string): string[] {
  const forms = new FormReader(source, fileName).readAll();
  const definitions = topLevelDefinitions(forms);
  const misplaced = findMisplacedExport(
    forms,
    new Set(definitions.map(({ name }) => name)),
  );
  if (misplaced !== undefined) {
    throw new Error(
      `${fileName}:${lineAt(source, misplaced.offset)}: expected :export only on the name of a def, defn, defn-, defonce or defmulti form at the top level or inside do.`,
    );
  }
  const names = definitions.flatMap(
    ({ name, meta }) => exportName(name.text, meta) ?? [],
  );
  return [...new Set(names)].sort();
}

export function renderDeclarations(exportNames: readonly string[]): string {
  const lines =
    exportNames.length > 0
      ? exportNames.map((name) => `export const ${name}: any;`)
      : ["export {};"];
  return [HEADER, ...lines, ""].join("\n");
}

function entrySourcePath({ namespace, line }: ShadowEntry): string {
  const basePath = `src/${entryModuleName(namespace).replaceAll(".", "/")}`;
  const sourcePaths = [`${basePath}.cljs`, `${basePath}.cljc`].filter(
    (sourcePath) => fs.existsSync(path.join(REPO_ROOT, sourcePath)),
  );
  if (sourcePaths.length !== 1) {
    throw new Error(
      `shadow-cljs.edn:${line}: expected ${basePath}.cljs or ${basePath}.cljc for ${namespace}, found ${sourcePaths.length === 0 ? "neither" : "both"}.`,
    );
  }
  return sourcePaths[0];
}

export function scanEntryExports(entry: ShadowEntry): string[] {
  const sourcePath = entrySourcePath(entry);
  const source = fs.readFileSync(path.join(REPO_ROOT, sourcePath), "utf8");
  return scanExportNames(source, sourcePath);
}

function writeIfChanged(filePath: string, content: string) {
  if (
    fs.existsSync(filePath) &&
    fs.readFileSync(filePath, "utf8") === content
  ) {
    return;
  }
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
  process.stdout.write(`Updated ${filePath}\n`);
}

function generateEntryTypes(
  entry: ShadowEntry,
): { content: string } | { error: string } {
  try {
    return { content: renderDeclarations(scanEntryExports(entry)) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function generateCljsTypes(): boolean {
  const entries = parseEntries(fs.readFileSync("shadow-cljs.edn", "utf8"));
  if (entries.length === 0) {
    throw new Error(
      "shadow-cljs.edn: expected at least one namespace in :builds :app :entries.",
    );
  }
  const results = new Map(
    entries.map((entry) => [
      `${TYPES_DIR}/${entryModuleName(entry.namespace)}.d.ts`,
      generateEntryTypes(entry),
    ]),
  );

  fs.mkdirSync(TYPES_DIR, { recursive: true });
  fs.readdirSync(TYPES_DIR)
    .sort()
    .map((fileName) => `${TYPES_DIR}/${fileName}`)
    .filter((filePath) => filePath.endsWith(".d.ts") && !results.has(filePath))
    .forEach((filePath) => {
      fs.rmSync(filePath, { force: true });
      process.stdout.write(`Removed ${filePath}\n`);
    });
  results.forEach((result, filePath) => {
    if ("content" in result) {
      writeIfChanged(filePath, result.content);
    }
  });

  const errors = [...results.values()].flatMap((result) =>
    "error" in result ? [result.error] : [],
  );
  errors.forEach((error) => console.error(error));
  if (errors.length > 0) {
    console.error(
      `Generated the cljs types for ${results.size - errors.length} of ${results.size} shadow-cljs.edn entries. Fix the errors above, then run \`bun run generate:cljs-types\` again.`,
    );
  }
  return errors.length === 0;
}

if (require.main === module) {
  process.chdir(REPO_ROOT);
  try {
    process.exitCode = generateCljsTypes() ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
