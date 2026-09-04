import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSourceFingerprint,
  createTypeGeneratorFingerprint,
} from "./source-fingerprint";

function writeRepoFile(root: string, path: string, contents: string): void {
  const absolutePath = join(root, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function createRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "source-fingerprint-"));
  writeRepoFile(root, "src/metabase/core.clj", "(ns metabase.core)");
  writeRepoFile(
    root,
    "enterprise/backend/src/metabase_enterprise/core.clj",
    "(ns metabase-enterprise.core)",
  );
  writeRepoFile(root, "deps.edn", "{:deps {}}");
  return root;
}

describe("createSourceFingerprint", () => {
  let root: string;

  beforeEach(() => {
    root = createRepo();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("is deterministic across calls", () => {
    expect(createSourceFingerprint(root)).toBe(createSourceFingerprint(root));
    expect(createSourceFingerprint(root)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("changes when a source file's content changes", () => {
    const before = createSourceFingerprint(root);
    writeRepoFile(root, "src/metabase/core.clj", "(ns metabase.core) ;; edit");
    expect(createSourceFingerprint(root)).not.toBe(before);
  });

  it("changes when an enterprise source file is added", () => {
    const before = createSourceFingerprint(root);
    writeRepoFile(
      root,
      "enterprise/backend/src/metabase_enterprise/new.clj",
      "(ns metabase-enterprise.new)",
    );
    expect(createSourceFingerprint(root)).not.toBe(before);
  });

  it("changes when the root deps.edn changes", () => {
    const before = createSourceFingerprint(root);
    writeRepoFile(root, "deps.edn", "{:deps {:extra true}}");
    expect(createSourceFingerprint(root)).not.toBe(before);
  });

  it("includes deps.edn files from module and bin roots only", () => {
    const before = createSourceFingerprint(root);
    writeRepoFile(root, "modules/drivers/redshift/deps.edn", "{:deps {}}");
    const withDriver = createSourceFingerprint(root);
    expect(withDriver).not.toBe(before);

    writeRepoFile(root, "bin/lint-migrations-file/deps.edn", "{:deps {}}");
    const withBin = createSourceFingerprint(root);
    expect(withBin).not.toBe(withDriver);

    // deps.edn outside the known roots is intentionally not fingerprinted.
    writeRepoFile(root, "docs/example/deps.edn", "{:deps {}}");
    expect(createSourceFingerprint(root)).toBe(withBin);
  });

  it("ignores files outside the fingerprinted roots", () => {
    const before = createSourceFingerprint(root);
    writeRepoFile(root, "frontend/src/app.tsx", "export {};");
    writeRepoFile(root, "docs/readme.md", "# docs");
    expect(createSourceFingerprint(root)).toBe(before);
  });

  it("distinguishes optional resource files when present", () => {
    const before = createSourceFingerprint(root);
    writeRepoFile(root, "resources/version.properties", "tag=v1");
    const withResource = createSourceFingerprint(root);
    expect(withResource).not.toBe(before);
    writeRepoFile(root, "resources/version.properties", "tag=v2");
    expect(createSourceFingerprint(root)).not.toBe(withResource);
  });

  it("hashes symlinks by their target path", () => {
    const before = createSourceFingerprint(root);
    symlinkSync("core.clj", join(root, "src/metabase/link.clj"));
    expect(createSourceFingerprint(root)).not.toBe(before);
  });

  it("does not throw when a listed file disappears before it is read", () => {
    // A dangling symlink stats (lstat) fine but cannot be read as a file;
    // regular reads race the same way when files are deleted mid-walk.
    symlinkSync("missing-target.clj", join(root, "src/metabase/dangling.clj"));
    expect(() => createSourceFingerprint(root)).not.toThrow();
  });
});

describe("createTypeGeneratorFingerprint", () => {
  let root: string;

  beforeEach(() => {
    root = createRepo();
    writeRepoFile(
      root,
      "frontend/build/openapi/openapi-ts.config.ts",
      "export default {};",
    );
    writeRepoFile(root, "package.json", "{}");
    writeRepoFile(root, "bun.lock", "{}");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("is deterministic and distinct from the source fingerprint", () => {
    expect(createTypeGeneratorFingerprint(root)).toBe(
      createTypeGeneratorFingerprint(root),
    );
    expect(createTypeGeneratorFingerprint(root)).not.toBe(
      createSourceFingerprint(root),
    );
  });

  it("changes when the generator config changes", () => {
    const before = createTypeGeneratorFingerprint(root);
    writeRepoFile(
      root,
      "frontend/build/openapi/openapi-ts.config.ts",
      "export default { changed: true };",
    );
    expect(createTypeGeneratorFingerprint(root)).not.toBe(before);
  });

  it("ignores backend source changes", () => {
    const before = createTypeGeneratorFingerprint(root);
    writeRepoFile(root, "src/metabase/core.clj", "(ns metabase.core) ;; edit");
    expect(createTypeGeneratorFingerprint(root)).toBe(before);
  });
});
