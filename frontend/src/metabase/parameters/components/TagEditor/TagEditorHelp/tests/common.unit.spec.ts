import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("TagEditorHelp (OSS)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true, sampleDatabaseId: 99 });

    expect(screen.getByText("Read the full documentation")).toBeInTheDocument();
  });

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false, sampleDatabaseId: 99 });

    expect(screen.getByText("Read the full documentation")).toBeInTheDocument();
  });

  it("should offer 'Try it' example buttons when a sample database is available", () => {
    setup({ sampleDatabaseId: 99 });

    expect(
      screen.getAllByRole("button", { name: "Try it" }).length,
    ).toBeGreaterThan(0);
  });

  it("should hide 'Try it' example buttons when no sample database is available (metabase#78037)", () => {
    setup({ sampleDatabaseId: null });

    expect(
      screen.queryByRole("button", { name: "Try it" }),
    ).not.toBeInTheDocument();
  });
});
