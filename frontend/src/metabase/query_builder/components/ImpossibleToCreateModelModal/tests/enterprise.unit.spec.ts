import { screen } from "__support__/ui";
import { setup as baseSetup } from "./setup";
import type { SetupOpts } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("ImpossibleToCreateModelModal (EE without token)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    const sqlSnippetLink = screen.getByRole("link", { name: "SQL snippets" });
    expect(sqlSnippetLink).toBeInTheDocument();
    expect(sqlSnippetLink).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/native-editor/sql-snippets.html",
    );

    const referenceLink = screen.getByRole("link", {
      name: "reference the results of another saved question",
    });
    expect(referenceLink).toBeInTheDocument();
    // TODO: Change this link or remove this comment once the discussion is over.
    // Discussion: https://metaboat.slack.com/archives/C01LQQ2UW03/p1704975076876289
    expect(referenceLink).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/native-editor/sql-snippets.html",
    );
  });

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    const sqlSnippetLink = screen.getByRole("link", { name: "SQL snippets" });
    expect(sqlSnippetLink).toBeInTheDocument();
    expect(sqlSnippetLink).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/native-editor/sql-snippets.html",
    );

    const referenceLink = screen.getByRole("link", {
      name: "reference the results of another saved question",
    });
    expect(referenceLink).toBeInTheDocument();
    // TODO: Change this link or remove this comment once the discussion is over.
    // Discussion: https://metaboat.slack.com/archives/C01LQQ2UW03/p1704975076876289
    expect(referenceLink).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/native-editor/sql-snippets.html",
    );
  });
});
