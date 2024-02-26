import { screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("NewModelOptions (EE without token)", () => {
  it("should render no data access notice when instance have no database access", async () => {
    setup({ databases: [] });

    expect(
      await screen.findByText("Metabase is no fun without any data"),
    ).toBeInTheDocument();
  });

  describe("has data access", () => {
    it("should render options for creating a model", async () => {
      setup({ databases: [createMockDatabase()] });

      expect(
        await screen.findByText("Use the notebook editor"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Use a native query")).toBeInTheDocument();
    });

    describe("whitelabel feature", () => {
      it("should render help link when `show-metabase-links: false`", async () => {
        setup({ databases: [createMockDatabase()], showMetabaseLinks: false });

        expect(await screen.findByText("What's a model?")).toBeInTheDocument();
      });

      it("should render help link when `show-metabase-links: true`", async () => {
        setup({ databases: [createMockDatabase()], showMetabaseLinks: true });

        expect(await screen.findByText("What's a model?")).toBeInTheDocument();
      });
    });
  });
});
