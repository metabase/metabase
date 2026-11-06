import {
  type Row,
  formatReport,
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
        (item) => item.status,
        {
          "https://old.example.com": { since: "2026-10-26", status: "404" },
          "https://recent.example.com": { since: "2026-10-28", status: "404" },
          "https://fixed.example.com": { since: "2026-10-01", status: "404" },
        },
        "2026-11-01",
      ),
    ).toEqual({
      due: [row("https://old.example.com", "500")],
      state: {
        "https://old.example.com": { since: "2026-10-26", status: "500" },
        "https://new.example.com": { since: "2026-11-01", status: "404" },
        "https://recent.example.com": { since: "2026-10-28", status: "404" },
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
        ],
        ["https://fine.com/a", "https://moved.com/a", "https://blocked.com/a"],
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
    ).toContain("| `^https://a\\.com` | Links pass |");
  });

  it("says which check crashed", () => {
    expect(
      formatReport([], { ...context, crashed: ["links to other sites"] }),
    ).toContain(
      "Checking links to other sites failed on 2026-11-01 without listing any links. See the [run](RUN).",
    );
  });
});
