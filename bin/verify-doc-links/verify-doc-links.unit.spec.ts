import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { useDocsUrl } from "metabase/common/hooks/use-docs-url";
import { getDocsUrl, getDocsUrlForVersion } from "metabase/selectors/settings";

import {
  DOCS_URL_HELPERS,
  checkLink,
  extractDocsLinks,
  headingIds,
} from "./verify-doc-links";

describe("DOCS_URL_HELPERS", () => {
  it("lists the helpers that build docs urls, so renaming one fails here", () => {
    expect(Object.keys(DOCS_URL_HELPERS).sort()).toEqual(
      [useDocsUrl.name, getDocsUrl.name, getDocsUrlForVersion.name].sort(),
    );
  });
});

describe("extractDocsLinks", () => {
  it("finds the page and anchor in every helper call shape", () => {
    const source = `
      useDocsUrl("a/b");
      useDocsUrl(
        "c/d",
        { anchor: "e" },
      );
      getDocsUrl(state, { page: "f/g", anchor: "h" });
      getDocsUrlForVersion(version, "i/j", "k");
      useDocsUrl(\`l/m\`);
      useDocsUrl(\`dynamic/\${page}\`);
      useDocsUrl(page);
      getDocsUrl(state, { searchQuery: "x" });
    `;
    expect(extractDocsLinks("x.tsx", source)).toEqual([
      { line: 2, page: "a/b", anchor: undefined },
      { line: 3, page: "c/d", anchor: "e" },
      { line: 7, page: "f/g", anchor: "h" },
      { line: 8, page: "i/j", anchor: "k" },
      { line: 9, page: "l/m", anchor: undefined },
    ]);
  });
});

describe("headingIds", () => {
  it("generates the ids the docs site generates", () => {
    const ids = headingIds(
      [
        "# Title",
        "### 2. Add a new endpoint",
        "### `MB_API_KEY`",
        "## Security warning: each end-user _must_ have a `token`",
        "## [Linked](https://example.com) heading",
        "## Custom {#my-id}",
        "## Title",
        "```",
        "# not a heading",
        "```",
      ].join("\n"),
    );
    expect([...ids]).toEqual([
      "title",
      "2-add-a-new-endpoint",
      "mb_api_key",
      "security-warning-each-end-user-must-have-a-token",
      "linked-heading",
      "my-id",
      "title-1",
    ]);
  });
});

describe("checkLink", () => {
  const docsDir = mkdtempSync(join(tmpdir(), "docs-"));
  mkdirSync(join(docsDir, "questions"));
  writeFileSync(
    join(docsDir, "questions/alerts.md"),
    "# Alerts\n## Create an alert\n",
  );

  it("accepts a page and anchor that exist", () => {
    expect(
      checkLink(
        { line: 1, page: "questions/alerts", anchor: "create-an-alert" },
        docsDir,
      ),
    ).toBeUndefined();
  });

  it("rejects a page that doesn't exist, like one that only survives as a redirect", () => {
    expect(
      checkLink({ line: 1, page: "questions/sharing/alerts" }, docsDir),
    ).toMatch(/doesn't exist/);
  });

  it("rejects a missing anchor", () => {
    expect(
      checkLink({ line: 1, page: "questions/alerts", anchor: "nope" }, docsDir),
    ).toMatch(/no heading/);
  });
});
