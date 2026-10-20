import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngines,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseEditApp } from "./DatabaseEditApp";

const NON_EXISTING_DATABASE_ID = 999;

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

const setupNonExistingDatabase = () => {
  setupEnginesEndpoint(createMockEngines());
  fetchMock.get(`path:/api/database/${NON_EXISTING_DATABASE_ID}`, {
    status: 404,
    body: "Not found.",
  });
  fetchMock.get(
    `path:/api/database/${NON_EXISTING_DATABASE_ID}/settings-available`,
    { status: 404, body: "Not found." },
  );

  renderWithProviders(
    <Route path="/admin/databases/:databaseId" element={<DatabaseEditApp />} />,
    {
      withRouter: true,
      initialRoute: `/admin/databases/${NON_EXISTING_DATABASE_ID}`,
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

  it("shows the database and lets admins remove it when its details are null (metabase#25715)", async () => {
    setup({
      database: createMockDatabase({
        name: "Sample Database",
        is_sample: true,
        details: undefined,
      }),
    });

    expect(
      await screen.findByTestId("database-connection-info-section"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("breadcrumbs")).toHaveTextContent(
      "Sample Database",
    );
    expect(
      screen.getByRole("button", { name: "Remove this database" }),
    ).toBeEnabled();
  });

  it("shows a cloud-attached database without editing or removing it", async () => {
    setup({
      database: createMockDatabase({
        name: "Sample Database",
        is_sample: true,
        is_attached_dwh: true,
        details: undefined,
      }),
    });

    const connectionSection = await screen.findByTestId(
      "database-connection-info-section",
    );
    expect(screen.getByTestId("breadcrumbs")).toHaveTextContent(
      "Sample Database",
    );
    expect(
      within(connectionSection).getByRole("button", {
        name: "Edit connection details",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Remove this database" }),
    ).not.toBeInTheDocument();
  });

  it("shows that data actions are enabled for the database", async () => {
    setup({
      database: createMockDatabase({
        features: ["actions"],
        settings: { "database-enable-actions": true },
      }),
    });

    expect(await screen.findByLabelText("Data actions")).toBeChecked();
  });

  it("shows an error instead of the database sections when the database does not exist (metabase#11037)", async () => {
    setupNonExistingDatabase();

    expect(await screen.findByText("Not found.")).toBeInTheDocument();
    expect(
      screen.queryByTestId("database-connection-info-section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("database-danger-zone-section"),
    ).not.toBeInTheDocument();
  });
});
