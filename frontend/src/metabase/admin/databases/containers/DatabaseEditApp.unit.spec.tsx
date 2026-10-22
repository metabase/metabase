import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngines,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseEditApp } from "./DatabaseEditApp";

const setup = ({ database }: { database: Database }) => {
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
  fetchMock.get(`path:/api/database/${database.id}/settings-available`, {
    settings: {},
  });

  renderWithProviders(
    <Route path="/admin/databases/:databaseId" element={<DatabaseEditApp />} />,
    {
      withRouter: true,
      initialRoute: `/admin/databases/${database.id}`,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
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
});
