import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { version } from "../package.json";

const CLI_PATH = join(__dirname, "..", "dist", "cli.js");

async function runCli(
  args: string[],
  options: { cwd?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile(
      "node",
      [CLI_PATH, ...args],
      { cwd: options.cwd ?? tmpDir },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code
            ? parseInt(String(error.code), 10)
            : error
              ? 1
              : 0,
        });
      },
    );
  });
}

let tmpDir: string;

beforeEach(async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir: osTmpdir } = await import("node:os");
  tmpDir = await mkdtemp(join(osTmpdir(), "custom-viz-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("cli --version", () => {
  it("prints the package version", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout.trim()).toBe(version);
  });
});

describe("cli --help", () => {
  it("shows usage information", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout).toContain("metabase-custom-viz");
    expect(stdout).toContain("init");
  });
});

describe("cli init", () => {
  it("scaffolds all expected files", async () => {
    const { exitCode } = await runCli(["init", "test-viz"]);
    expect(exitCode).toBe(0);

    const projectDir = join(tmpDir, "test-viz");
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
      expect(existsSync(join(projectDir, file)), `${file} should exist`).toBe(
        true,
      );
    }
  });

  it("substitutes the project name in package.json", async () => {
    await runCli(["init", "my-viz"]);
    const pkg = JSON.parse(
      readFileSync(join(tmpDir, "my-viz", "package.json"), "utf-8"),
    );
    expect(pkg.name).toBe("my-viz");
  });

  it("substitutes the SDK version in package.json", async () => {
    await runCli(["init", "my-viz"]);
    const pkg = JSON.parse(
      readFileSync(join(tmpDir, "my-viz", "package.json"), "utf-8"),
    );
    expect(pkg.devDependencies["@metabase/custom-viz"]).toBe(version);
  });

  it("substitutes the project name in metabase-plugin.json", async () => {
    await runCli(["init", "my-viz"]);
    const manifest = JSON.parse(
      readFileSync(join(tmpDir, "my-viz", "metabase-plugin.json"), "utf-8"),
    );
    expect(manifest.name).toBe("my-viz");
  });

  it("rewrites the import path in index.tsx", async () => {
    await runCli(["init", "my-viz"]);
    const indexTsx = readFileSync(
      join(tmpDir, "my-viz", "src", "index.tsx"),
      "utf-8",
    );
    expect(indexTsx).toContain('from "@metabase/custom-viz"');
    expect(indexTsx).not.toContain('from "../"');
  });

  it("normalizes the project name", async () => {
    await runCli(["init", "My Custom Viz"]);
    const projectDir = join(tmpDir, "my-custom-viz");
    expect(existsSync(projectDir)).toBe(true);

    const pkg = JSON.parse(
      readFileSync(join(projectDir, "package.json"), "utf-8"),
    );
    expect(pkg.name).toBe("my-custom-viz");
  });

  it("uses normalized id and human-friendly display name in index.tsx", async () => {
    await runCli(["init", "My Custom Viz"]);
    const indexTsx = readFileSync(
      join(tmpDir, "my-custom-viz", "src", "index.tsx"),
      "utf-8",
    );
    expect(indexTsx).toContain('id: "my-custom-viz"');
    expect(indexTsx).toContain('getName: () => "My Custom Viz"');
  });

  it("exits with error for invalid name", async () => {
    const { exitCode, stderr } = await runCli(["init", "!!!invalid"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not a valid project name");
  });

  it("exits with error if directory already exists", async () => {
    await runCli(["init", "test-viz-existing"]);
    const { exitCode, stderr } = await runCli(["init", "test-viz-existing"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("already exists");
  });
});
