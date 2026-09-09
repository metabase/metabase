import fs from "fs";
import path from "path";

const translated: { text: string; stack?: string }[] = [];
let recording = false;

jest.mock("ttag", () => {
  const record = (
    strings: TemplateStringsArray | string,
    ...values: unknown[]
  ) => {
    const text = typeof strings === "string" ? strings : strings.join("{}");
    if (recording) {
      translated.push({ text, stack: new Error().stack });
    }
    return typeof strings === "string"
      ? strings
      : String.raw({ raw: strings }, ...values);
  };
  const chained = {
    t: record,
    jt: record,
    ngettext: record,
    msgid: record,
    gettext: record,
  };
  return {
    ...chained,
    c: () => chained,
    addLocale: jest.fn(),
    useLocale: jest.fn(),
    setDefaultLang: jest.fn(),
    default: {},
  };
});

const ROOT = path.resolve(__dirname, "../..");

/*
 * Modules that still translate while they are imported. Each needs a change
 * this check cannot make mechanically. Do not add to this list: make the
 * module translate when it is read instead.
 */
const KNOWN_IMPORT_TIME_TRANSLATIONS = [
  // Redux state must stay plain, so immer reads any getter when it freezes the
  // initial state. The admin path names belong in the component, not in state.
  "frontend/src/metabase/admin/app/reducers.ts",
];
const ROOTS = (
  process.env.I18N_IMPORT_ROOTS ?? "frontend/src,enterprise/frontend/src"
).split(",");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        [
          "__mocks__",
          "__support__",
          "node_modules",
          ".storybook",
          "shared-tests",
          "test",
          "tests",
        ].includes(entry.name)
      ) {
        continue;
      }
      out.push(...sourceFiles(p));
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.spec\.tsx?$/.test(entry.name) &&
      !/(^|[.-])test-utils\.tsx?$|^test-/.test(entry.name) &&
      !/\.stories\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("translation at import time", () => {
  it("no module translates while it is being imported", async () => {
    const files = ROOTS.flatMap((r) => sourceFiles(path.join(ROOT, r)));
    const unimportable: string[] = [];

    // Modules are imported outside the app, so many of them log on the way up,
    // and a few register jest hooks that cannot be nested inside a test.
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
    const hookNames = [
      "beforeAll",
      "beforeEach",
      "afterEach",
      "afterAll",
    ] as const;
    const realHooks = hookNames.map(
      (name) => [name, globalThis[name]] as const,
    );
    for (const name of hookNames) {
      // globalThis is not typed with jest's hook registrars.
      (globalThis as unknown as Record<string, unknown>)[name] = () => {};
    }

    recording = true;
    for (const file of files) {
      try {
        await import(file);
      } catch {
        unimportable.push(path.relative(ROOT, file));
      }
    }
    recording = false;
    for (const [name, hook] of realHooks) {
      // globalThis is not typed with jest's hook registrars.
      (globalThis as unknown as Record<string, unknown>)[name] = hook;
    }
    consoleError.mockRestore();
    consoleWarn.mockRestore();

    // eslint-disable-next-line no-console
    console.log(
      `imported ${files.length - unimportable.length}/${files.length} modules; ` +
        `${unimportable.length} could not be imported`,
    );

    const byModule = new Map<string, Set<string>>();
    for (const { text, stack } of translated) {
      const frames = (stack ?? "")
        .split("\n")
        .map((line) => line.match(/\(?(\/[^\s)]+\.tsx?):\d+:\d+\)?/)?.[1])
        .filter(
          (file): file is string =>
            Boolean(file) && !file!.includes("i18n-import-time"),
        )
        .map((file) => path.relative(ROOT, file));
      const key = frames.slice(0, 3).join("  <- ") || "unattributed";
      (byModule.get(key) ?? byModule.set(key, new Set()).get(key)!).add(text);
    }

    const offenders = [...byModule.keys()].filter(
      (file) =>
        !KNOWN_IMPORT_TIME_TRANSLATIONS.some((known) => file.includes(known)),
    );

    expect(offenders).toEqual([]);
  }, 600000);
});
