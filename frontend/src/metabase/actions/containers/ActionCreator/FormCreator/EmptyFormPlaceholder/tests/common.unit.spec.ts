import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("EmptyFormPlaceholder (OSS)", () => {
  it("should render help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });
    expect(
      screen.getByText("Build custom forms and business logic."),
    ).toBeInTheDocument();
    expect(screen.getByText("See an example")).toBeInTheDocument();
  });

  it("should render help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });
    expect(
      screen.getByText("Build custom forms and business logic."),
    ).toBeInTheDocument();
    expect(screen.getByText("See an example")).toBeInTheDocument();
  });
});
