import fetch from "node-fetch";

import {
  SUPPORTED_TAGS_PLACEHOLDER,
  generateDockerReadme,
  getDockerTagRowStatus,
  pushDockerReadme,
  renderDockerReadme,
} from "./docker-readme";

jest.mock("node-fetch", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockFetch = jest.mocked(fetch);

const response = (ok: boolean, body: object = {}) =>
  ({
    ok,
    status: ok ? 200 : 401,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as any;

describe("docker-readme", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("getDockerTagRowStatus", () => {
    it.each([
      ["v0.65.0-beta", false, "Beta"],
      ["v0.64.0.3", true, "Beta"],
      ["v0.64.1", true, "LTS"],
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
      "v0.65.x",
      "v0.64.3",
      "v0.64.3.1",
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

    const line = (major: number, lts: boolean, eol: string) => ({
      major,
      lts,
      eol,
    });

    it.each([
      ["oss", "v0"],
      ["ee", "v1"],
    ] as const)(
      "renders a %s row with the newest %s tags for each supported major version that has a release",
      async (edition, prefix) => {
        mockFetch.mockResolvedValue(
          response(true, {
            major_version_support: [
              line(65, false, "2027-01-01"),
              line(64, true, "2027-12-01"),
              line(63, false, "2026-11-01"),
              line(62, false, "2026-09-01"),
              line(61, false, "2027-06-01"),
              line(58, true, "2027-02-17"),
            ],
          }),
        );

        const readme = await generateDockerReadme({
          github: github as any,
          owner: "metabase",
          repo: "metabase",
          latestMajorVersion: "64",
          edition,
          today: "2026-10-21",
          template: `# Supported Tags\n${SUPPORTED_TAGS_PLACEHOLDER}\n\nFooter`,
        });

        expect(readme).toBe(
          [
            "# Supported Tags",
            "| Version | Status | Tags |",
            "|---|---|---|",
            `| 65 | Beta | \`${prefix}.65.x\`, \`${prefix}.65.0-beta\` |`,
            `| 64 | LTS | \`latest\`, \`${prefix}.64-lts\`, \`${prefix}.64.x\`, \`${prefix}.64.3.x\`, \`${prefix}.64.3.1\` |`,
            `| 63 | Supported | \`${prefix}.63.x\`, \`${prefix}.63.21.x\`, \`${prefix}.63.21\` |`,
            `| 58 | LTS | \`${prefix}.58-lts\`, \`${prefix}.58.x\`, \`${prefix}.58.37.x\`, \`${prefix}.58.37\` |`,
            "",
            "Footer",
          ].join("\n"),
        );
      },
    );

    it("adds the -lts tag to an LTS major version that is still in beta", async () => {
      tags.push("v0.66.0.3");
      mockFetch.mockResolvedValue(
        response(true, {
          major_version_support: [line(66, true, "2028-01-01")],
        }),
      );

      const readme = await generateDockerReadme({
        github: github as any,
        owner: "metabase",
        repo: "metabase",
        latestMajorVersion: "65",
        edition: "oss",
        today: "2026-10-21",
        template: SUPPORTED_TAGS_PLACEHOLDER,
      });
      tags.pop();

      expect(readme).toContain(
        "| 66 | Beta | `v0.66-lts`, `v0.66.x`, `v0.66.0.x`, `v0.66.0.3` |",
      );
    });

    it("throws with the URL when version-info.json cannot be fetched", async () => {
      mockFetch.mockResolvedValue(response(false));

      await expect(
        generateDockerReadme({
          github: github as any,
          owner: "metabase",
          repo: "metabase",
          latestMajorVersion: "64",
          edition: "oss",
          template: SUPPORTED_TAGS_PLACEHOLDER,
        }),
      ).rejects.toThrow(/Failed to fetch .*version-info\.json: 401/);
    });
  });

  describe("pushDockerReadme", () => {
    const push = (token = "pat") =>
      pushDockerReadme({
        readme: "# README",
        repository: "metabase/metabase",
        username: "user",
        token,
      });

    it("gets an access token and sends the README to the repository", async () => {
      mockFetch
        .mockResolvedValueOnce(response(true, { access_token: "jwt" }))
        .mockResolvedValueOnce(response(true));

      await push();

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

      await expect(push("bad")).rejects.toThrow(
        "Docker Hub authentication failed: 401",
      );
    });

    it("throws when the authentication response has no access token", async () => {
      mockFetch.mockResolvedValueOnce(response(true, { token: "jwt" }));

      await expect(push()).rejects.toThrow(
        "Docker Hub authentication response has no access_token",
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
