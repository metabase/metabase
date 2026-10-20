import userEvent from "@testing-library/user-event";
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
  setupSettingsAvailableEndpoint(database.id);
  renderDatabaseEditApp(database.id);
};

const setupSettingsAvailableEndpoint = (databaseId: DatabaseId) => {
  fetchMock.get(`path:/api/database/${databaseId}/settings-available`, {
    settings: {},
  });
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

const SAMPLE_DATABASE = createMockDatabase({
  id: 1,
  name: "Sample Database",
  engine: "h2",
  is_sample: true,
});

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

  it("should handle malformed (null) database details (metabase#25715)", async () => {
    setup({ database: SAMPLE_DATABASE, hasNullDetails: true });

    expect(
      await within(
        await screen.findByTestId("database-header-section"),
      ).findByText("Sample Database"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove this database" }),
    ).toBeEnabled();
  });

  it("should not allow to edit the connection of an attached DWH sample database", async () => {
    setup({
      database: { ...SAMPLE_DATABASE, is_attached_dwh: true },
      hasNullDetails: true,
    });

    expect(
      await within(screen.getByTestId("breadcrumbs")).findByText(
        "Sample Database",
      ),
    ).toBeInTheDocument();
    const editButton = within(
      screen.getByTestId("database-connection-info-section"),
    ).getByRole("button", { name: "Edit connection details" });
    expect(editButton).toBeDisabled();

    await userEvent.hover(editButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "The sample database cannot be edited.",
    );
  });

  it("should handle non-existing databases (metabase#11037)", async () => {
    setupEnginesEndpoint(createMockEngines());
    setupDatabaseNotFoundEndpoint(999);
    setupSettingsAvailableEndpoint(999);
    renderDatabaseEditApp(999);

    expect(await screen.findByText("Not found.")).toBeInTheDocument();
    expect(
      screen.queryByTestId("database-connection-info-section"),
    ).not.toBeInTheDocument();
  });
});
