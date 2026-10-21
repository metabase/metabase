import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
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
  tokenFeatures?: Partial<TokenFeatures>;
}

const setup = ({ database, tokenFeatures }: SetupOpts) => {
  setupEnginesEndpoint({});
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

  const settings = tokenFeatures
    ? mockSettings({ "token-features": createMockTokenFeatures(tokenFeatures) })
    : undefined;
  if (tokenFeatures) {
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

  describe("database routing", () => {
    const routableDatabase = createMockDatabase({
      engine: "postgres",
      features: ["database-routing"],
    });

    afterEach(() => {
      reinitialize();
    });

    it("hides the database routing section without the enterprise plugin", async () => {
      setup({ database: routableDatabase });

      expect(
        await screen.findByTestId("database-connection-info-section"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("database-routing-section"),
      ).not.toBeInTheDocument();
    });

    it("hides the database routing section when the token lacks the database_routing feature", async () => {
      setup({ database: routableDatabase, tokenFeatures: {} });

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
        tokenFeatures: { database_routing: true },
      });

      expect(
        await screen.findByTestId("database-routing-section"),
      ).toBeInTheDocument();
    });
  });
});
