import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupDatabaseNotFoundEndpoint,
  setupDatabaseUsageInfoEndpoint,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database, DatabaseId } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngines,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseEditApp } from "./DatabaseEditApp";

const NON_EXISTING_DATABASE_ID = 999;

const SAMPLE_DATABASE = createMockDatabase({
  name: "Sample Database",
  is_sample: true,
});

interface SetupOpts {
  database: Database;
  hasNullDetails?: boolean;
}

const setup = ({ database, hasNullDetails = false }: SetupOpts) => {
  if (hasNullDetails) {
    // Registered before `setupDatabaseEndpoints` so that this route matches
    // first. The backend can send `details: null`, which `Database` does not allow.
    fetchMock.get(`path:/api/database/${database.id}`, {
      ...database,
      details: null,
    });
  }
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

  renderDatabaseEditApp(database.id);
};

const setupNonExistingDatabase = () => {
  setupEnginesEndpoint(createMockEngines());
  setupDatabaseNotFoundEndpoint(NON_EXISTING_DATABASE_ID);
  fetchMock.get(
    `path:/api/database/${NON_EXISTING_DATABASE_ID}/settings-available`,
    { status: 404, body: "Not found." },
  );

  renderDatabaseEditApp(NON_EXISTING_DATABASE_ID);
};

const renderDatabaseEditApp = (databaseId: DatabaseId) => {
  renderWithProviders(
    <Route path="/admin/databases/:databaseId" element={<DatabaseEditApp />} />,
    {
      withRouter: true,
      initialRoute: `/admin/databases/${databaseId}`,
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
    setup({ database: SAMPLE_DATABASE, hasNullDetails: true });

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

  it("shows a cloud-attached database without editing, removing or data actions", async () => {
    setup({
      database: {
        ...SAMPLE_DATABASE,
        features: ["actions"],
        is_attached_dwh: true,
      },
      hasNullDetails: true,
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
    expect(
      screen.queryByTestId("database-data-actions-section"),
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
