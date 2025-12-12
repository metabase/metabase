import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("NewModelOptions (OSS)", () => {
  it("should render no data access notice when instance have no database access", async () => {
    setup({ canCreateQueries: false });

    expect(
      await screen.findByText("Metabase is no fun without any data"),
    ).toBeInTheDocument();
  });

  describe("has data access", () => {
    it("should render options for creating a model", async () => {
      setup({ canCreateQueries: true, canCreateNativeQueries: true });

      expect(
        await screen.findByText("Use the notebook editor"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Use a native query")).toBeInTheDocument();
    });

    describe("whitelabel feature", () => {
      it("should render help link when `show-metabase-links: false`", async () => {
        setup({ canCreateQueries: true, showMetabaseLinks: false });

        expect(await screen.findByText("What's a model?")).toBeInTheDocument();
      });

      it("should render help link when `show-metabase-links: true`", async () => {
        setup({ canCreateQueries: true, showMetabaseLinks: true });

        expect(await screen.findByText("What's a model?")).toBeInTheDocument();
      });
    });
  });
});
