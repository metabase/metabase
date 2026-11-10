import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createGuard, refuseUncommitted } from "../lib/guard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOLD = path.join(HERE, "fixtures", "hold-break.mjs");
const CHECK = path.join(HERE, "..", "check.mjs");
const FILE = "src/thing.ts";
const ORIGINAL = "export const value = 'original';\n";

let root;
let stateDir;
const dirs = [];

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-guard-"));
  dirs.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, FILE), ORIGINAL);
  git("add", ".");
  git("commit", "-qm", "init");
  return fs.realpathSync(dir);
}

const read = () => fs.readFileSync(path.join(root, FILE), "utf8");
const status = () => spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout;
const marker = () => path.join(stateDir, "applied.json");

function holdBreak() {
  const child = spawn(process.execPath, [HOLD, root, stateDir, FILE], { stdio: ["ignore", "pipe", "inherit"] });
  const applied = new Promise((resolve) => {
    child.stdout.on("data", (d) => String(d).includes("applied") && resolve());
  });
  const exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  return { child, applied, exited };
}

beforeEach(() => {
  root = makeRepo();
  stateDir = path.join(root, ".git", "e2e-replacement-check");
});

after(() => {
  for (const d of dirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("guard", () => {
  it("should restore the file and remove the marker after a break", () => {
    const guard = createGuard({ root, stateDir });
    guard.apply([{ file: FILE, after: "broken\n" }]);
    assert.equal(read(), "broken\n");
    assert.ok(fs.existsSync(marker()));
    guard.revert();
    assert.equal(read(), ORIGINAL);
    assert.ok(!fs.existsSync(marker()));
    assert.equal(status(), "");
  });

  it("should restore the file when the test run throws", async () => {
    const guard = createGuard({ root, stateDir });
    await assert.rejects(
      guard.withBreak([{ file: FILE, after: "broken\n" }], async () => {
        assert.equal(read(), "broken\n");
        throw new Error("jest crashed");
      }),
      /jest crashed/,
    );
    assert.equal(read(), ORIGINAL);
    assert.ok(!fs.existsSync(marker()));
  });

  it("should refuse to apply a second break while one is applied", () => {
    const guard = createGuard({ root, stateDir });
    guard.apply([{ file: FILE, after: "broken\n" }]);
    assert.throws(() => guard.apply([{ file: FILE, after: "other\n" }]), /already applied/);
    guard.revert();
    assert.equal(read(), ORIGINAL);
  });

  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ]) {
    it(`should revert the break when the run is interrupted with ${signal}`, async () => {
      const { child, applied, exited } = holdBreak();
      await applied;
      assert.match(read(), /broken/);
      child.kill(signal);
      const { code: exitCode } = await exited;
      assert.equal(exitCode, code);
      assert.equal(read(), ORIGINAL);
      assert.ok(!fs.existsSync(marker()));
      assert.equal(status(), "");
    });
  }

  it("should restore a break left by a killed run before doing anything else", async () => {
    const { child, applied, exited } = holdBreak();
    await applied;
    child.kill("SIGKILL");
    await exited;
    assert.match(read(), /broken/);
    assert.ok(fs.existsSync(marker()));

    const restored = createGuard({ root, stateDir }).recoverLeftover();
    assert.deepEqual(restored, [FILE]);
    assert.equal(read(), ORIGINAL);
    assert.ok(!fs.existsSync(marker()));
    assert.equal(status(), "");
  });

  it("should restore a killed run's break from the restore command", async () => {
    const { child, applied, exited } = holdBreak();
    await applied;
    child.kill("SIGKILL");
    await exited;
    const r = spawnSync(process.execPath, [CHECK, "restore"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Restored src\/thing\.ts/);
    assert.equal(read(), ORIGINAL);
  });

  it("should leave a live run's break alone", async () => {
    const { child, applied, exited } = holdBreak();
    await applied;
    assert.throws(() => createGuard({ root, stateDir }).recoverLeftover(), /another run/);
    assert.match(read(), /broken/);
    child.kill("SIGTERM");
    await exited;
    assert.equal(read(), ORIGINAL);
  });

  it("should refuse files with uncommitted changes", () => {
    fs.writeFileSync(path.join(root, FILE), "work in progress\n");
    assert.throws(() => refuseUncommitted(root, [FILE]), /uncommitted changes/);
    fs.writeFileSync(path.join(root, FILE), ORIGINAL);
    assert.doesNotThrow(() => refuseUncommitted(root, [FILE]));
  });
});
