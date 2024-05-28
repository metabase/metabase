import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { whitelabel: true },
    ...opts,
  });
}

describe("ImpossibleToCreateModelModal (EE with token)", () => {
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

  it("should not show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByText(
        "To solve this, just remove the variables in this question and try again. (It's okay to use SQL snippets or reference the results of another saved question in your query.)",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "SQL snippets" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "reference the results of another saved question",
      }),
    ).not.toBeInTheDocument();
  });
});
