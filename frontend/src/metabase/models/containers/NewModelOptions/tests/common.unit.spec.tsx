import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import { delay } from "metabase/lib/promise";
import { createMockDatabase } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("NewModelOptions (OSS)", () => {
  it("should render no data access notice when instance have no database access", async () => {
    setup({ databases: [] });

    expect(
      await screen.findByText("Metabase is no fun without any data"),
    ).toBeInTheDocument();
  });

  describe("has data access", () => {
    it("should render loading indicator when fetching databases (metabase#44813)", async () => {
      // Mocking the response needs to happen before the setup
      // because setup already instantiates the component - it contains `renderWithProviders`.
      fetchMock.get(
        "path:/api/database",
        delay(2000).then(() => {
          return [createMockDatabase()];
        }),
        { overwriteRoutes: true },
      );

      setup({ databases: [createMockDatabase()] });

      expect(await screen.findByTestId("loading-spinner")).toBeInTheDocument();
      expect(
        screen.queryByText("Metabase is no fun without any data"),
      ).not.toBeInTheDocument();
    });

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
