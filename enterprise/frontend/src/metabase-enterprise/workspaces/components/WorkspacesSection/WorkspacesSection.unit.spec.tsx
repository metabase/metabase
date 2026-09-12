import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { WORKSPACES_SCHEMA_SETTING } from "../../constants";

import { WorkspacesSection } from "./WorkspacesSection";

interface SetupOpts {
  database?: Database;
  workspacesEnabled?: boolean;
}

const setup = ({
  database = createMockDatabase({
    features: ["schemas"],
    tables: [
      createMockTable({ id: 1, schema: "public" }),
      createMockTable({ id: 2, schema: "analytics" }),
    ],
  }),
  workspacesEnabled = true,
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    "workspaces-enabled": workspacesEnabled,
    "token-features": createMockTokenFeatures({ workspaces: true }),
  });

  setupEnterprisePlugins();
  setupDatabasesEndpoints([database]);

  renderWithProviders(
    <>
      <WorkspacesSection database={database} />
      <UndoListing />
    </>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("WorkspacesSection", () => {
  it("does not render when workspaces-enabled is false", () => {
    setup({ workspacesEnabled: false });

    expect(screen.queryByTestId("workspaces-section")).not.toBeInTheDocument();
  });

  it("does not render when the database lacks the schemas feature", () => {
    setup({
      database: createMockDatabase({ features: [] }),
      workspacesEnabled: true,
    });

    expect(screen.queryByTestId("workspaces-section")).not.toBeInTheDocument();
  });

  it("renders the schema select with the saved schema selected and options from syncable_schemas", async () => {
    const database = createMockDatabase({
      features: ["schemas"],
      tables: [
        createMockTable({ id: 1, schema: "public" }),
        createMockTable({ id: 2, schema: "analytics" }),
      ],
      settings: { [WORKSPACES_SCHEMA_SETTING]: "analytics" },
    });

    setup({ database });

    expect(await screen.findByTestId("workspaces-section")).toBeInTheDocument();
    expect(screen.getByText("Workspace schema")).toBeInTheDocument();

    const select = await screen.findByTestId("workspace-schema-select");
    expect(select).toHaveDisplayValue("analytics");

    await userEvent.click(select);
    expect(await screen.findByText("public")).toBeInTheDocument();
  });

  it("PUTs the picked schema to /api/database/:id", async () => {
    const database = createMockDatabase({
      features: ["schemas"],
      tables: [
        createMockTable({ id: 1, schema: "public" }),
        createMockTable({ id: 2, schema: "analytics" }),
      ],
    });

    setup({ database });

    const select = await screen.findByTestId("workspace-schema-select");
    await userEvent.click(select);

    const option = await screen.findByText("analytics");
    await userEvent.click(option);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain(`/api/database/${database.id}`);
    expect(body).toStrictEqual({
      settings: { [WORKSPACES_SCHEMA_SETTING]: "analytics" },
    });
  });
});
