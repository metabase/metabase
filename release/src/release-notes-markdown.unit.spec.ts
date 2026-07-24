import { renderReleaseNotesMarkdown } from "./release-notes-markdown";
import type { Issue } from "./types";

const makeIssue = (n: number, title: string, labels: string[]): Issue =>
  ({
    number: n,
    title,
    html_url: `https://github.com/metabase/metabase/issues/${n}`,
    labels: labels.map(name => ({ name })),
  }) as Issue;

describe("renderReleaseNotesMarkdown", () => {
  it("groups issues by section and product category with issue links", () => {
    const md = renderReleaseNotesMarkdown([
      makeIssue(1, "Add a chart type", ["Visualization"]),
      makeIssue(2, "Fix a query crash", ["Type:Bug", "Querying"]),
      makeIssue(3, "Tidy up CI", [".CI & Tests"]),
    ]);

    expect(md).toContain("## Enhancements");
    expect(md).toContain("**Visualization**");
    expect(md).toContain("- Add a chart type ([#1](https://github.com/metabase/metabase/issues/1))");

    expect(md).toContain("## Bug fixes");
    expect(md).toContain("**Querying**");
    expect(md).toContain("- Fix a query crash ([#2](https://github.com/metabase/metabase/issues/2))");

    expect(md).toContain("## Under the hood");

    // Enhancements section comes before Bug fixes.
    expect(md.indexOf("## Enhancements")).toBeLessThan(md.indexOf("## Bug fixes"));
  });

  it("omits hidden issues and empty sections", () => {
    const md = renderReleaseNotesMarkdown([
      makeIssue(10, "Secret internal note", ["no-release-notes"]),
      makeIssue(11, "A real enhancement", ["Database"]),
    ]);

    expect(md).not.toContain("Secret internal note");
    expect(md).toContain("## Enhancements");
    expect(md).not.toContain("## Bug fixes");
    expect(md).not.toContain("## Under the hood");
  });
});
