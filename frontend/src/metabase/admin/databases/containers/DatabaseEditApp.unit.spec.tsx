import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
  setupDatabaseWithNullDetailsEndpoint,
  setupEnginesEndpoint,
  setupListTransformsEndpoint,
  setupUserAttributesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type { Database, TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngines,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseEditApp } from "./DatabaseEditApp";

interface SetupOpts {
  database: Database;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  hasNullDetails?: boolean;
}

const setup = ({
  database,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
  hasNullDetails,
}: SetupOpts) => {
  setupEnginesEndpoint({});
  if (hasNullDetails) {
    setupDatabaseWithNullDetailsEndpoint(database);
  }
  setupDatabaseEndpoints(database);
  setupEnginesEndpoint(createMockEngines());
  setupDatabaseUsageInfoEndpoint(database, {
    question: 0,
    dataset: 0,
    metric: 0,
    segment: 0,
    transform: 0,
  });
  setupUserAttributesEndpoint([]);
  setupListTransformsEndpoint([]);
  fetchMock.get(`path:/api/database/${database.id}/settings-available`, {
    settings: {},
  });

  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  if (hasEnterprisePlugins) {
    setupEnterpriseOnlyPlugin("database_routing");
  }

  renderWithProviders(
    <Route path="/admin/databases/:databaseId" element={<DatabaseEditApp />} />,
    {
      withRouter: true,
      initialRoute: `/admin/databases/${database.id}`,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings,
      }),
    },
  );
};

describe("DatabaseEditApp", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows every section for a regular database", async () => {
    setup({ database: createMockDatabase({ features: ["actions"] }) });

    expect(
      await screen.findByTestId("database-connection-info-section"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("database-data-actions-section"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("database-danger-zone-section"),
    ).toBeInTheDocument();
  });

  it("shows only the connection and danger zone sections for a stub database", async () => {
    setup({
      database: createMockDatabase({ features: ["actions"], is_stub: true }),
    });

    expect(
      await screen.findByTestId("database-connection-info-section"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("database-data-actions-section"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("database-danger-zone-section"),
    ).toBeInTheDocument();
  });

  it("renders a database whose details are null (metabase#25715)", async () => {
    setup({
      database: createMockDatabase({
        id: 7,
        name: "Sample Database",
        is_sample: true,
      }),
      hasNullDetails: true,
    });

    expect(
      await screen.findByRole("heading", { name: "Sample Database" }),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.called("database-7-null-details")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Remove this database" }),
    ).toBeEnabled();
  });

  it("disables editing and removing an attached DWH database with null details", async () => {
    setup({
      database: createMockDatabase({
        id: 8,
        name: "Cloud Warehouse",
        features: ["actions"],
        is_attached_dwh: true,
      }),
      hasNullDetails: true,
    });

    expect(
      await screen.findByRole("heading", { name: "Cloud Warehouse" }),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.called("database-8-null-details")).toBe(true);
    const editButton = screen.getByRole("button", {
      name: "Edit connection details",
    });
    expect(editButton).toBeDisabled();
    await userEvent.hover(editButton);
    expect(
      await screen.findByRole("tooltip", {
        name: "This database is managed by Metabase Cloud and cannot be modified.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove this database" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("database-data-actions-section"),
    ).not.toBeInTheDocument();
  });

  describe("database routing", () => {
    const routableDatabase = createMockDatabase({
      engine: "postgres",
      features: ["database-routing"],
    });

    it("hides the database routing section when the token lacks the database_routing feature", async () => {
      setup({ database: routableDatabase, hasEnterprisePlugins: true });

      expect(
        await screen.findByTestId("database-connection-info-section"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("database-routing-section"),
      ).not.toBeInTheDocument();
    });

    it("shows the database routing section when the token has the database_routing feature", async () => {
      setup({
        database: routableDatabase,
        hasEnterprisePlugins: true,
        tokenFeatures: { database_routing: true },
      });

      expect(
        await screen.findByTestId("database-routing-section"),
      ).toBeInTheDocument();
    });

    it("hides the database routing section without the enterprise plugin", async () => {
      setup({
        database: routableDatabase,
        tokenFeatures: { database_routing: true },
      });

      expect(
        await screen.findByTestId("database-connection-info-section"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("database-routing-section"),
      ).not.toBeInTheDocument();
    });
  });
});
