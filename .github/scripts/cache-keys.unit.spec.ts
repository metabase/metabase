import { execFileSync } from "child_process";
import { join } from "path";

const SCRIPT = join(__dirname, "cache-keys.sh");

const CACHES = ["m2", "bun-store", "cypress", "eslint"];

const run = (args: string[] = [], env: NodeJS.ProcessEnv = {}) =>
  execFileSync(SCRIPT, args, {
    encoding: "utf8",
    env: { ...process.env, RUNNER_OS: "Linux", GITHUB_SHA: "abc123", ...env },
  });

const get = (name: string, env: NodeJS.ProcessEnv = {}) =>
  run([name], env).trimEnd();

describe("cache-keys.sh", () => {
  it("is deterministic for a given tree", () => {
    expect(run()).toEqual(run());
  });

  it("emits every cache's path, key and restore key", () => {
    for (const cache of CACHES) {
      expect(get(`${cache}-path`)).not.toEqual("");
      expect(get(`${cache}-key`)).not.toEqual("");
      expect(get(`${cache}-restore-key`)).not.toEqual("");
    }
  });

  // Silently returning "" for a name that does not exist is how a caller ends up building a key with a
  // hole in it.
  it("fails on an unknown output name", () => {
    expect(() => run(["no-such-output"])).toThrow();
  });

  // A key equal to its own restore prefix points every dependency set at one entry, and nothing reports
  // it. This is the failure the script exists to prevent.
  it("never emits a key equal to its own restore prefix", () => {
    for (const cache of CACHES) {
      const key = get(`${cache}-key`);
      const prefix = get(`${cache}-restore-key`);
      expect(key.startsWith(prefix)).toBe(true);
      expect(key.length).toBeGreaterThan(prefix.length);
    }
  });

  it("scopes every key to the runner OS", () => {
    for (const cache of CACHES) {
      expect(get(`${cache}-key`, { RUNNER_OS: "Linux" })).not.toEqual(
        get(`${cache}-key`, { RUNNER_OS: "macOS" }),
      );
    }
  });

  // Home paths must be absolute: actions/cache expands a tilde but a shell assigning one to a variable
  // does not, and would create a directory literally named `~`.
  it("emits absolute paths for home directory locations", () => {
    expect(get("bun-store-path").startsWith("/")).toBe(true);
    expect(get("cypress-path").startsWith("/")).toBe(true);
    for (const line of get("m2-path").split("\n")) {
      expect(line.startsWith("~")).toBe(false);
    }
  });

  // The Cypress binary depends on the Cypress version alone, so an unrelated dependency bump must not
  // invalidate a 200MB download.
  it("keys the Cypress binary on the resolved version, not the lockfile", () => {
    expect(get("cypress-key")).toMatch(/^cypress-Linux-\d+\.\d+\.\d+/);
  });

  it("keys the ESLint cache on the commit", () => {
    expect(get("eslint-key", { GITHUB_SHA: "deadbeef" })).toEqual(
      "eslint-Linux-deadbeef",
    );
  });
});
