import {
  type Row,
  buildReport,
  formatReport,
  isOtherSite,
  parseFailures,
  parseLycheeIgnore,
  quarantine,
  recheckFailures,
  staleExcludes,
} from "./report-links";

const row = (link: string, status = "404"): Row => ({
  where: "docs/a.md:1",
  link,
  status,
});

describe("quarantine", () => {
  it("reports links failing for 6 days and forgets ones that pass", () => {
    expect(
      quarantine(
        [
          row("https://old.example.com", "500"),
          row("https://new.example.com"),
          row("https://recent.example.com"),
        ],
        (item) => item.link,
        {
          "https://old.example.com": "2026-10-26",
          "https://recent.example.com": "2026-10-28",
          "https://fixed.example.com": "2026-10-01",
        },
        "2026-11-01",
      ),
    ).toEqual({
      due: [row("https://old.example.com", "500")],
      state: {
        "https://old.example.com": "2026-10-26",
        "https://new.example.com": "2026-11-01",
        "https://recent.example.com": "2026-10-28",
      },
    });
  });
});

describe("parseLycheeIgnore", () => {
  it("tags only the pattern right after an expect line", () => {
    expect(
      parseLycheeIgnore(
        "# a comment\n# expect: 403\n^https://a\\.com\n\n^https://b\\.com\n",
      ),
    ).toEqual([
      { pattern: "^https://a\\.com", expect: "403" },
      { pattern: "^https://b\\.com", expect: undefined },
    ]);
  });
});

describe("staleExcludes", () => {
  it("flags excludes that match nothing, pass, or fail differently", () => {
    expect(
      staleExcludes(
        [
          { pattern: "^https://gone\\.com", expect: "403" },
          { pattern: "^https://fine\\.com", expect: "403" },
          { pattern: "^https://moved\\.com", expect: "403" },
          { pattern: "^https://blocked\\.com", expect: "Network error" },
          { pattern: "^https://untagged\\.com" },
          { pattern: "^https://prefix\\.com", expect: "30" },
          { pattern: "(?i)^https://rust\\.com" },
        ],
        [
          "https://fine.com/a",
          "https://moved.com/a",
          "https://blocked.com/a",
          "https://untagged.com/a",
          "https://prefix.com/a",
        ],
        recheckFailures({
          error_map: {
            stdin: [
              {
                url: "https://moved.com/a",
                status: { text: "Not found", code: 404 },
              },
              {
                url: "https://blocked.com/a",
                status: {
                  text: "Network error: HTTP/2 (error sending request)",
                },
              },
              {
                url: "https://untagged.com/a",
                status: { text: "Forbidden", code: 403 },
              },
              {
                url: "https://prefix.com/a",
                status: { text: "Found", code: 302 },
              },
            ],
          },
        }),
      ),
    ).toEqual([
      { pattern: "^https://gone\\.com", reason: "Matches no link" },
      { pattern: "^https://fine\\.com", reason: "Links pass" },
      {
        pattern: "^https://moved\\.com",
        link: "https://moved.com/a",
        reason: "https://moved.com/a returns 404, expected 403",
      },
      {
        pattern: "^https://untagged\\.com",
        link: "https://untagged.com/a",
        reason: "https://untagged.com/a returns 403, and has no expect line",
      },
      {
        pattern: "^https://prefix\\.com",
        link: "https://prefix.com/a",
        reason: "https://prefix.com/a returns 302, expected 30",
      },
      {
        pattern: "(?i)^https://rust\\.com",
        reason: "Not a JavaScript regex, so not rechecked",
      },
    ]);
  });
});

describe("parseFailures", () => {
  it("keeps a status code alone and drops a network error's url tail", () => {
    expect(
      parseFailures(
        [
          "docs/developers-guide/frontend.md:150: https://www.npmjs.com/package/ttag: Rejected status code: 403 Forbidden",
          "docs/developers-guide/drivers/plugins.md:58: https://clojuredocs.org/clojure.core/require: Network error: SSL certificate expired. Site needs to renew certificate (error sending request for url (https://clojuredocs.org/clojure.core/require))",
          "",
        ].join("\n"),
      ),
    ).toEqual([
      {
        where: "docs/developers-guide/frontend.md:150",
        link: "https://www.npmjs.com/package/ttag",
        status: "403",
      },
      {
        where: "docs/developers-guide/drivers/plugins.md:58",
        link: "https://clojuredocs.org/clojure.core/require",
        status:
          "Network error: SSL certificate expired. Site needs to renew certificate",
      },
    ]);
  });
});

describe("formatReport", () => {
  const context = { date: "2026-11-01", runUrl: "RUN", blobUrl: "BLOB" };

  it("links each location and escapes pipes", () => {
    const report = formatReport(
      [
        row("https://a.example.com/?x=1|2", "a|b"),
        row("https://b.example.com"),
      ],
      context,
    );
    expect(report).toContain("**2 broken links** on 2026-11-01 ([run](RUN))");
    expect(report).toContain(
      "| [`docs/a.md:1`](BLOB/docs/a.md#L1) | https://a.example.com/?x=1\\|2 | a\\|b |",
    );
  });

  it("is empty with nothing to report", () => {
    expect(formatReport([], context)).toBe("");
  });

  it("lists excludes to review", () => {
    expect(
      formatReport([], {
        ...context,
        stale: [{ pattern: "^https://a\\.com", reason: "Links pass" }],
      }),
    ).toContain("| `^https://a\\.com` | Links pass |  |");
  });

  it("says which check crashed", () => {
    expect(
      formatReport([], { ...context, crashed: ["links to other sites"] }),
    ).toContain(
      "Checking links to other sites failed on 2026-11-01, so this list may be incomplete. See the [run](RUN).",
    );
  });
});

describe("isOtherSite", () => {
  it.each([
    ["https://example.com/a", true],
    ["https://metabase.com.evil.org/a", true],
    ["https://metaba.se/sdk-npm", true],
    ["https://www.metabase.com/learn", false],
    ["https://store.metabase.com", false],
    ["https://github.com/metabase/metabase/wiki/Page", false],
    ["https://github.com/metabase/metabase/issues/1", true],
    ["docs/a.md", false],
  ])("%s is another site: %s", (link, expected) => {
    expect(isOtherSite(link)).toBe(expected);
  });
});

describe("buildReport", () => {
  const base = {
    site: [],
    today: "2026-11-08",
    runUrl: "RUN",
    blobUrl: "BLOB",
  };
  const ignore = "# expect: 403\n^https://walled\\.com\n";
  const walled = {
    error_map: {
      stdin: [
        {
          url: "https://walled.com/a",
          status: { text: "Forbidden", code: 403 },
        },
      ],
    },
  };

  it("holds a new external link and lists it a week later", () => {
    const external = [row("https://example.com/a"), row("docs/b.md")];
    const first = buildReport({ ...base, external, state: {} });
    expect(first.report).toContain("docs/b.md");
    expect(first.report).not.toContain("example.com");
    expect(first.state?.external).toEqual({
      "https://example.com/a": "2026-11-08",
    });

    const second = buildReport({
      ...base,
      external,
      state: first.state,
      today: "2026-11-15",
    });
    expect(second.report).toContain("| 404 since 2026-11-08 |");
  });

  it("keeps the clocks running when the external check crashed", () => {
    const state = {
      external: { "https://example.com/a": "2026-11-01" },
      excludes: { "^https://gone\\.com": "2026-11-01" },
    };
    const result = buildReport({
      ...base,
      external: [row("https://other.example.com")],
      externalCrashed: true,
      recheck: { ignore, excluded: [], report: walled },
      state,
    });
    expect(result.state).toBe(state);
    expect(result.report).toContain("Checking links to other sites failed");
    expect(result.report).not.toContain("Excludes to review");
  });

  it("says so when the recheck didn't run", () => {
    expect(
      buildReport({
        ...base,
        recheck: { ignore, excluded: ["https://walled.com/a"] },
        state: { excludes: { x: "2026-11-01" } },
      }),
    ).toEqual({
      report: expect.stringContaining(
        "Checking the links .lycheeignore skips failed",
      ),
      state: { external: {}, excludes: { x: "2026-11-01" } },
    });
  });

  it("lists an exclude to review once it has been stale for a week", () => {
    const recheck = { ignore, excluded: [], report: walled };
    const first = buildReport({ ...base, recheck, state: {} });
    expect(first.report).toBe("");
    const second = buildReport({
      ...base,
      recheck,
      state: first.state,
      today: "2026-11-15",
    });
    expect(second.report).toContain(
      "| `^https://walled\\.com` | Matches no link | 2026-11-08 |",
    );
  });
});
