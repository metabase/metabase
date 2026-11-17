import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseEndpoints,
  setupDatabaseNotFoundEndpoint,
  setupDatabaseUsageInfoEndpoint,
  setupDatabaseWithNullDetailsEndpoint,
  setupEnginesEndpoint,
  setupListTransformsEndpoint,
  setupUserAttributesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type { Database, DatabaseId, TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngines,
  createMockTokenFeatures,
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
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

const setup = ({
  database,
  hasNullDetails = false,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
}: SetupOpts) => {
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

  renderDatabaseEditApp(database.id, settings);
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

const renderDatabaseEditApp = (
  databaseId: DatabaseId,
  settings = mockSettings({}),
) => {
  renderWithProviders(
    <Route path="/admin/databases/:databaseId" element={<DatabaseEditApp />} />,
    {
      withRouter: true,
      initialRoute: `/admin/databases/${databaseId}`,
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
