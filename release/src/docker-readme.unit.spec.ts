import fetch from "node-fetch";

import {
  SUPPORTED_TAGS_PLACEHOLDER,
  generateDockerReadme,
  getDockerTagRowStatus,
  getDockerTagsForVersion,
  pushDockerReadme,
  renderDockerReadme,
} from "./docker-readme";

jest.mock("node-fetch", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockFetch = jest.mocked(fetch);

describe("docker-readme", () => {
  describe("getDockerTagsForVersion", () => {
    it("lists every tag for the latest LTS patch release", () => {
      expect(
        getDockerTagsForVersion({
          version: "v0.64.3.1",
          isLatest: true,
          isLts: true,
        }),
      ).toEqual(["latest", "v0.64-lts", "v0.64.x", "v0.64.3.x", "v0.64.3.1"]);
    });

    it("lists tags for a minor release", () => {
      expect(
        getDockerTagsForVersion({
          version: "v0.63.21",
          isLatest: false,
          isLts: false,
        }),
      ).toEqual(["v0.63.x", "v0.63.21.x", "v0.63.21"]);
    });

    it("lists tags for a beta patch release", () => {
      expect(
        getDockerTagsForVersion({
          version: "v0.65.0.9-beta",
          isLatest: false,
          isLts: false,
        }),
      ).toEqual(["v0.65.x", "v0.65.0.x", "v0.65.0.9-beta"]);
    });

    it("lists tags for a first beta of a major release", () => {
      expect(
        getDockerTagsForVersion({
          version: "v0.66.0-beta",
          isLatest: false,
          isLts: false,
        }),
      ).toEqual(["v0.66.x", "v0.66.0-beta"]);
    });
  });

  describe("getDockerTagRowStatus", () => {
    it.each([
      ["v0.65.0-beta", false, "Beta"],
      ["v0.65.0.9-beta", false, "Beta"],
      ["v0.64.0.3", true, "Beta"],
      ["v0.64.1", true, "LTS"],
      ["v0.64.3.1", true, "LTS"],
      ["v0.63.21", false, "Supported"],
    ])("%s with lts=%s is %s", (version, lts, status) => {
      expect(getDockerTagRowStatus({ version, lts })).toBe(status);
    });
  });

  describe("renderDockerReadme", () => {
    it("throws when the template has no placeholder", () => {
      expect(() =>
        renderDockerReadme({ template: "# Tags", rows: [] }),
      ).toThrow(SUPPORTED_TAGS_PLACEHOLDER);
    });
  });

  describe("generateDockerReadme", () => {
    const tags = [
      "v0.65.0-beta",
      "v0.65.0.8-beta",
      "v0.65.0.9-beta",
      "v0.65.x",
      "v0.65.0.x",
      "v0.64.0-beta",
      "v0.64.3",
      "v0.64.3.1",
      "v0.64.3.x",
      "v0.64-lts",
      "v0.63.20",
      "v0.63.21",
      "v0.62.10",
      "v0.58.37",
    ];

    const github = {
      rest: { git: { listMatchingRefs: "listMatchingRefs" } },
      paginate: jest.fn((_fn: unknown, { ref }: { ref: string }) =>
        Promise.resolve(
          tags
            .filter((tag) => `tags/${tag}`.startsWith(ref))
            .map((tag) => ({ ref: `refs/tags/${tag}` })),
        ),
      ),
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        json: async () => ({
          major_version_support: [
            {
              major: 65,
              released: "2026-10-12",
              lts: false,
              eol: "2027-01-01",
            },
            { major: 64, released: "2026-09-16", lts: true, eol: "2027-12-01" },
            {
              major: 63,
              released: "2026-07-07",
              lts: false,
              eol: "2026-11-01",
            },
            {
              major: 62,
              released: "2026-06-01",
              lts: false,
              eol: "2026-09-01",
            },
            { major: 58, released: "2025-12-17", lts: true, eol: "2027-02-17" },
          ],
        }),
      } as any);
    });

    it("renders a row with the newest tags for each supported major version", async () => {
      const readme = await generateDockerReadme({
        github: github as any,
        owner: "metabase",
        repo: "metabase",
        latestMajorVersion: "64",
        today: "2026-10-21",
        template: `# Supported Tags\n${SUPPORTED_TAGS_PLACEHOLDER}\n\nFooter`,
      });

      expect(readme).toBe(
        [
          "# Supported Tags",
          "| Version | Status | Tags |",
          "|---|---|---|",
          "| 65 | Beta | `v0.65.x`, `v0.65.0.x`, `v0.65.0.9-beta` |",
          "| 64 | LTS | `latest`, `v0.64-lts`, `v0.64.x`, `v0.64.3.x`, `v0.64.3.1` |",
          "| 63 | Supported | `v0.63.x`, `v0.63.21.x`, `v0.63.21` |",
          "| 58 | LTS | `v0.58-lts`, `v0.58.x`, `v0.58.37.x`, `v0.58.37` |",
          "",
          "Footer",
        ].join("\n"),
      );
    });

    it("skips a supported major version without release tags", async () => {
      const readme = await generateDockerReadme({
        github: {
          ...github,
          paginate: jest.fn(() => Promise.resolve([])),
        } as any,
        owner: "metabase",
        repo: "metabase",
        latestMajorVersion: "64",
        today: "2026-10-21",
        template: SUPPORTED_TAGS_PLACEHOLDER,
      });

      expect(readme).toBe("| Version | Status | Tags |\n|---|---|---|");
    });
  });

  describe("pushDockerReadme", () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    const response = (ok: boolean, body: object = {}) =>
      ({
        ok,
        status: ok ? 200 : 401,
        json: async () => body,
        text: async () => JSON.stringify(body),
      }) as any;

    it("gets an access token and sends the README to the repository", async () => {
      mockFetch
        .mockResolvedValueOnce(response(true, { access_token: "jwt" }))
        .mockResolvedValueOnce(response(true));

      await pushDockerReadme({
        readme: "# README",
        repository: "metabase/metabase",
        username: "user",
        token: "pat",
      });

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "https://hub.docker.com/v2/auth/token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ identifier: "user", secret: "pat" }),
        }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://hub.docker.com/v2/repositories/metabase/metabase/",
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({ Authorization: "Bearer jwt" }),
          body: JSON.stringify({ full_description: "# README" }),
        }),
      );
    });

    it("throws when authentication fails", async () => {
      mockFetch.mockResolvedValueOnce(response(false));

      await expect(
        pushDockerReadme({
          readme: "# README",
          repository: "metabase/metabase",
          username: "user",
          token: "bad",
        }),
      ).rejects.toThrow("Docker Hub authentication failed: 401");
    });
  });
});
