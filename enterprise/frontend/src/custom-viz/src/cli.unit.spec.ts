import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { version } from "../package.json";

const CLI_PATH = join(__dirname, "..", "dist", "cli.js");

function runInit(name: string, cwd: string) {
  return execSync(`node ${CLI_PATH} init "${name}"`, {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
  });
}

describe("cli init", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "custom-viz-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("scaffolds all expected files", () => {
    runInit("test-viz", tempDir);

    const root = join(tempDir, "test-viz");
    const expectedFiles = [
      "package.json",
      "package-lock.json",
      "vite.config.ts",
      "tsconfig.json",
      "src/index.tsx",
      "metabase-plugin.json",
      "public/assets/icon.svg",
      "public/assets/thumbs-up.png",
      "public/assets/thumbs-down.png",
      ".gitignore",
    ];

    for (const file of expectedFiles) {
      expect(existsSync(join(root, file))).toBe(true);
    }
  });

  it("substitutes the project name in package.json", () => {
    runInit("my-cool-viz", tempDir);

    const pkg = JSON.parse(
      readFileSync(join(tempDir, "my-cool-viz", "package.json"), "utf-8"),
    );
    expect(pkg.name).toBe("my-cool-viz");
  });

  it("substitutes the SDK version in package.json", () => {
    runInit("test-viz", tempDir);

    const pkg = JSON.parse(
      readFileSync(join(tempDir, "test-viz", "package.json"), "utf-8"),
    );
    expect(pkg.devDependencies["@metabase/custom-viz"]).toBe(version);
  });

  it("substitutes the project name in metabase-plugin.json", () => {
    runInit("my-viz", tempDir);

    const manifest = JSON.parse(
      readFileSync(join(tempDir, "my-viz", "metabase-plugin.json"), "utf-8"),
    );
    expect(manifest.name).toBe("my-viz");
  });

  it("rewrites the import path in index.tsx", () => {
    runInit("test-viz", tempDir);

    const indexContent = readFileSync(
      join(tempDir, "test-viz", "src", "index.tsx"),
      "utf-8",
    );
    expect(indexContent).toContain("@metabase/custom-viz");
    expect(indexContent).not.toContain('from "../"');
  });

  it("normalizes the project name", () => {
    runInit("  My Cool Viz  ", tempDir);

    expect(existsSync(join(tempDir, "my-cool-viz", "package.json"))).toBe(true);
  });

  it("exits with error for invalid name", () => {
    expect(() => runInit("---", tempDir)).toThrow();
  });

  it("exits with error if directory already exists", () => {
    runInit("test-viz", tempDir);
    expect(() => runInit("test-viz", tempDir)).toThrow();
  });
});
