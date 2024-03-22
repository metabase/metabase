import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("EmbedHomepage (OSS)", () => {
  it("should default to the static tab for OSS builds", () => {
    setup();
    expect(
      screen.getByText("Use static embedding", { exact: false }),
    ).toBeInTheDocument();

    // making sure Tabs isn't just rendering both tabs, making the test always pass
    expect(
      screen.queryByText("Use interactive embedding", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("should link to the docs", () => {
    setup();
    expect(screen.getByText("Learn more")).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/static-embedding.html",
    );
  });

  it("should prompt to enable embedding if it wasn't auto enabled", () => {
    setup({ settings: { "setup-embedding-autoenabled": false } });

    expect(
      screen.getByText("Enable embedding in the settings"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Embedding has been automatically enabled for you"),
    ).not.toBeInTheDocument();
  });

  it("should not prompt to enable embedding if it was auto enabled", () => {
    setup({ settings: { "setup-embedding-autoenabled": true } });

    expect(
      screen.queryByText("Enable embedding in the settings"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Embedding has been automatically enabled for you"),
    ).toBeInTheDocument();
  });
});
