import { screen, waitForElementToBeRemoved } from "@testing-library/react";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { createMockDatabase } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("NewModelOptions (OSS)", () => {
  it("should render loading state while fetching databases", async () => {
    setupDatabasesEndpoints([]);
    setup({ databases: [] });

    expect(screen.getByTestId("loading-wrapper")).toBeInTheDocument();
    await waitForElementToBeRemoved(() =>
      screen.queryByTestId("loading-wrapper"),
    );
  });

  it("should render no data access notice when instance have no database access", async () => {
    setupDatabasesEndpoints([]);
    setup({ databases: [] });

    await waitForElementToBeRemoved(() =>
      screen.queryByTestId("loading-wrapper"),
    );
    expect(
      screen.getByText("Metabase is no fun without any data"),
    ).toBeInTheDocument();
  });

  describe("has data access", () => {
    it("should render options for creating a model", async () => {
      const database = createMockDatabase();
      setupDatabasesEndpoints([database]);
      setup({ databases: [database] });

      await waitForElementToBeRemoved(() =>
        screen.queryByTestId("loading-wrapper"),
      );
      expect(screen.getByText("Use the notebook editor")).toBeInTheDocument();
      expect(screen.getByText("Use a native query")).toBeInTheDocument();
    });

    describe("whitelabel feature", () => {
      it("should render help link when `show-metabase-links: false`", async () => {
        const database = createMockDatabase();
        setupDatabasesEndpoints([database]);
        setup({ databases: [database], showMetabaseLinks: false });

        await waitForElementToBeRemoved(() =>
          screen.queryByTestId("loading-wrapper"),
        );
        expect(screen.getByText("What's a model?")).toBeInTheDocument();
      });

      it("should render help link when `show-metabase-links: true`", async () => {
        const database = createMockDatabase();
        setupDatabasesEndpoints([database]);
        setup({ databases: [database], showMetabaseLinks: true });

        await waitForElementToBeRemoved(() =>
          screen.queryByTestId("loading-wrapper"),
        );
        expect(screen.getByText("What's a model?")).toBeInTheDocument();
      });
    });
  });
});
