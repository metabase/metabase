import "dotenv/config";
import { Octokit } from "@octokit/rest";
import { isLatestRelease } from "./github";

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env as any;
const github = new Octokit({ auth: GITHUB_TOKEN });

describe("github release helpers", () => {
  beforeAll(() => {
    expect(GITHUB_TOKEN).toBeDefined();
    expect(GITHUB_OWNER).toBeDefined();
    expect(GITHUB_REPO).toBeDefined();
  });
  describe("isLatestRelease", () => {
    // Note: if we've gotten to metabase v99 🥳 you'll need to update this test
    it("should always tell you v0.99 is the latest release", async () => {
      const isLatest = await isLatestRelease({
        github,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        version: "v0.99.0",
      });

      expect(isLatest).toBe(true);
    });

    it("should always tell you v1.99 is the latest release", async () => {
      const isLatest = await isLatestRelease({
        github,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        version: "v1.99.0",
      });

      expect(isLatest).toBe(true);
    });

    it("should never tell you that v0.1 is the latest release", async () => {
      const isLatest = await isLatestRelease({
        github,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        version: "v0.1.0",
      });

      expect(isLatest).toBe(false);
    });

    it("should never tell you that v1.1 is the latest release", async () => {
      const isLatest = await isLatestRelease({
        github,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        version: "v1.1.0",
      });

      expect(isLatest).toBe(false);
    });

    it("should never tell you that an RC is a latest release", async () => {
      const isLatestEE = await isLatestRelease({
        github,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        version: "v1.99.0-RC9",
      });

      expect(isLatestEE).toBe(false);

      const isLatestOSS = await isLatestRelease({
        github,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        version: "v0.99.0-RC9",
      });

      expect(isLatestOSS).toBe(false);
    });
  });
});
