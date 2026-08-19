import { execFileSync } from "child_process";
import { join } from "path";

const SCRIPT = join(__dirname, "cache-keys.sh");

const run = (args: string[] = [], env: NodeJS.ProcessEnv = {}) =>
  execFileSync(SCRIPT, args, {
    encoding: "utf8",
    env: { ...process.env, RUNNER_OS: "Linux", GITHUB_SHA: "abc123", ...env },
  });

const spec = (env: NodeJS.ProcessEnv = {}) =>
  Object.fromEntries(
    run([], env)
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("~") && !l.includes("<<"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );

describe("cache-keys.sh", () => {
  it("is deterministic for a given tree", () => {
    expect(run()).toEqual(run());
  });

  it("prints a single value when given a name", () => {
    expect(run(["m2-key"]).trim()).toEqual(spec()["m2-key"]);
  });

  // The failure this guards is silent: a key that collapses onto its own restore prefix points every
  // dependency set at one entry instead of missing.
  it("never emits a key equal to its own restore prefix", () => {
    const s = spec();
    for (const name of ["m2", "bun-store", "cypress", "eslint"]) {
      expect(s[`${name}-key`]).not.toEqual(s[`${name}-restore-key`]);
      expect(s[`${name}-key`].startsWith(s[`${name}-restore-key`])).toBe(true);
      expect(s[`${name}-key`].length).toBeGreaterThan(s[`${name}-restore-key`].length);
    }
  });

  it("scopes every key to the runner OS", () => {
    const linux = spec({ RUNNER_OS: "Linux" });
    const mac = spec({ RUNNER_OS: "macOS" });
    for (const key of Object.keys(linux).filter((k) => k.endsWith("-key"))) {
      expect(linux[key]).not.toEqual(mac[key]);
    }
  });

  // The Cypress binary depends on the Cypress version alone, so an unrelated dependency bump must not
  // invalidate a 200MB download.
  it("keys the Cypress binary on the resolved version, not the lockfile", () => {
    expect(spec()["cypress-key"]).toMatch(/^cypress-Linux-\d+\.\d+\.\d+/);
  });

  it("keys the ESLint cache on the commit", () => {
    expect(spec({ GITHUB_SHA: "deadbeef" })["eslint-key"]).toEqual("eslint-Linux-deadbeef");
  });
});
