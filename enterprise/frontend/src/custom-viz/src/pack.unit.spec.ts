import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir as osTmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { extract as tarExtract } from "tar-stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI_PATH = join(__dirname, "..", "dist", "cli.js");
const PACK_PATH = join(__dirname, "..", "dist", "pack.js");

// Kept in sync with the limits in pack.mjs.
const MAX_COMPRESSED_BYTES = 5 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;

// The scaffolded project's name and version, which name the archive.
const TGZ_NAME = "my-viz-0.0.1.tgz";

type Entry = { name: string; mode?: number; content: Buffer };

const formatMiB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

let tmpDir: string;
let projectDir: string;

/** Mimics `vite build`: emits the bundle and copies the icon into dist/assets/. */
function buildProject(bundle: Buffer | string = "console.log('viz')") {
  mkdirSync(join(projectDir, "dist", "assets"), { recursive: true });
  writeFileSync(join(projectDir, "dist", "index.js"), bundle);
  cpSync(
    join(projectDir, "public", "assets", "icon.svg"),
    join(projectDir, "dist", "assets", "icon.svg"),
  );
}

/** Rewrites one of the project's JSON files. */
function editJson(file: string, edit: (json: Record<string, unknown>) => void) {
  const path = join(projectDir, file);
  const json = JSON.parse(readFileSync(path, "utf-8"));
  edit(json);
  writeFileSync(path, JSON.stringify(json, null, 2));
}

/** Runs pack.mjs against the scaffolded project, the way the CLI does. */
function runPack(): string {
  return execFileSync("node", [PACK_PATH], {
    cwd: projectDir,
    encoding: "utf-8",
    // Pipe stderr so failing-path assertions don't print stack traces.
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function readTgz(path: string): Promise<Entry[]> {
  const tarBuffer = gunzipSync(readFileSync(path));
  const extract = tarExtract();
  const entries: Entry[] = [];

  return new Promise((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        entries.push({
          name: header.name,
          mode: header.mode,
          content: Buffer.concat(chunks),
        });
        next();
      });
    });
    extract.on("finish", () => resolve(entries));
    extract.on("error", reject);
    extract.end(tarBuffer);
  });
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(osTmpdir(), "custom-viz-pack-"));
  execFileSync("node", [CLI_PATH, "init", "my-viz"], {
    cwd: tmpDir,
    stdio: "ignore",
  });
  projectDir = join(tmpDir, "my-viz");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("pack", () => {
  it("writes <name>-<version>.tgz into the working directory", () => {
    buildProject();

    const stdout = runPack();

    expect(stdout).toContain(join(projectDir, TGZ_NAME));
    expect(stdout).toContain("Packed ");
  });

  it("packs the manifest, the bundle, and the icon", async () => {
    buildProject();
    runPack();

    const entries = await readTgz(join(projectDir, TGZ_NAME));

    expect(entries.map((entry) => entry.name)).toEqual([
      "metabase-plugin.json",
      "dist/index.js",
      "dist/assets/icon.svg",
    ]);
    expect(entries[1].content.toString()).toBe("console.log('viz')");
    expect(entries[2].content.toString()).toBe(
      readFileSync(join(projectDir, "public", "assets", "icon.svg"), "utf-8"),
    );
    for (const entry of entries) {
      expect(entry.mode).toBe(0o644);
    }
  });

  it("leaves out files the icon doesn't cover", async () => {
    // The icon is the only asset Metabase serves, so nothing else in
    // dist/assets/ belongs in the archive.
    buildProject();
    writeFileSync(join(projectDir, "dist", "assets", "extra.svg"), "<svg />");
    runPack();

    const entries = await readTgz(join(projectDir, TGZ_NAME));

    expect(entries.map((entry) => entry.name)).not.toContain(
      "dist/assets/extra.svg",
    );
  });

  it("rejects a project without a manifest", () => {
    buildProject();
    rmSync(join(projectDir, "metabase-plugin.json"));

    expect(runPack).toThrow(
      "metabase-plugin.json not found at the project root.",
    );
  });

  it("rejects a manifest without a name", () => {
    buildProject();
    editJson("metabase-plugin.json", (manifest) => delete manifest.name);

    expect(runPack).toThrow('metabase-plugin.json is missing a "name" field.');
  });

  it("rejects a project that has not been built", () => {
    expect(runPack).toThrow(
      'dist/index.js not found. Run "npm run build" first.',
    );
  });

  it("rejects a package.json without a version", () => {
    buildProject();
    editJson("package.json", (pkg) => delete pkg.version);

    expect(runPack).toThrow('package.json is missing a "version" field.');
  });

  it("rejects an icon missing from dist/assets/", () => {
    buildProject();
    rmSync(join(projectDir, "dist", "assets", "icon.svg"));

    expect(runPack).toThrow(
      'Asset "icon.svg" declared in metabase-plugin.json but missing from dist/assets/.',
    );
  });

  it("rejects a bundle over the uncompressed limit", () => {
    // Zeros compress to almost nothing, so only the uncompressed check trips.
    buildProject(Buffer.alloc(MAX_UNCOMPRESSED_BYTES + 1024));

    expect(runPack).toThrow(
      `exceeds limit of ${formatMiB(MAX_UNCOMPRESSED_BYTES)}`,
    );
  });

  it("rejects a bundle over the compressed limit", () => {
    // Random bytes are incompressible, so the archive stays under the
    // uncompressed limit while blowing past the compressed one.
    buildProject(randomBytes(MAX_COMPRESSED_BYTES + 1024 * 1024));

    expect(runPack).toThrow(
      `exceeds limit of ${formatMiB(MAX_COMPRESSED_BYTES)}`,
    );
  });
});
