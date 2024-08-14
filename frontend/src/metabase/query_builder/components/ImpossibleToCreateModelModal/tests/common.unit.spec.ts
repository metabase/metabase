import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("ImpossibleToCreateModelModal (OSS)", () => {
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
    expect(referenceLink).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/native-editor/referencing-saved-questions-in-queries.html#referencing-models-and-saved-questions",
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
    expect(referenceLink).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/native-editor/referencing-saved-questions-in-queries.html#referencing-models-and-saved-questions",
    );
  });
});
