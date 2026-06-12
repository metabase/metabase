import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseHealthcheckEndpoint,
  setupUpdateDatabaseEndpoint,
  setupUpdateDatabaseEndpointError,
} from "__support__/server-mocks/database";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { WorkspaceDatabaseSection } from "./WorkspaceDatabaseSection";

interface SetupOpts {
  database?: Database;
  withError?: boolean;
}

function setup({
  database = createMockDatabase({ features: ["workspace"] }),
  withError = false,
}: SetupOpts = {}) {
  setupDatabaseHealthcheckEndpoint(database.id);
  if (withError) {
    setupUpdateDatabaseEndpointError(database.id);
  } else {
    setupUpdateDatabaseEndpoint(database);
  }
  renderWithProviders(
    <>
      <WorkspaceDatabaseSection database={database} />
      <UndoListing />
    </>,
  );
}

function createWorkspaceDatabase(opts: Partial<Database> = {}) {
  return createMockDatabase({
    features: ["workspace"],
    settings: { "database-enable-workspaces": true },
    ...opts,
  });
}

describe("WorkspaceDatabaseSection", () => {
  it("should not render for a non-modifiable database (attached DWH)", () => {
    setup({
      database: createMockDatabase({
        is_attached_dwh: true,
        features: ["workspace"],
      }),
    });

    expect(
      screen.queryByTestId("workspace-database-section"),
    ).not.toBeInTheDocument();
  });

  it("should not render when the database does not support the workspace feature", () => {
    setup({ database: createMockDatabase({ features: [] }) });

    expect(
      screen.queryByTestId("workspace-database-section"),
    ).not.toBeInTheDocument();
  });

  it("should render the enable toggle unchecked when Workspaces are disabled", () => {
    setup({ database: createMockDatabase({ features: ["workspace"] }) });

    expect(
      screen.getByTestId("workspace-database-section"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Enable workspaces/i }),
    ).not.toBeChecked();
  });

  it("should render the enable toggle checked when Workspaces are enabled", () => {
    setup({ database: createWorkspaceDatabase() });

    expect(
      screen.getByRole("switch", { name: /Enable workspaces/i }),
    ).toBeChecked();
  });

  it("should not show the connection section while Workspaces are disabled", () => {
    setup({ database: createMockDatabase({ features: ["workspace"] }) });

    expect(
      screen.queryByText("Admin database connection"),
    ).not.toBeInTheDocument();
  });

  it("should persist the database-enable-workspaces setting when toggling on", async () => {
    const database = createMockDatabase({ features: ["workspace"] });
    setup({ database });

    await userEvent.click(
      screen.getByRole("switch", { name: /Enable workspaces/i }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/database/${database.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });
  });

  it("should show the description and an Add connection link when enabled without a connection", () => {
    setup({ database: createWorkspaceDatabase() });

    expect(screen.getByText("Admin database connection")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Used to create isolated schemas and temporary users for workspaces.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Add admin connection")).toBeInTheDocument();
  });

  it("should show the connection status with Edit and Remove buttons when a connection exists", async () => {
    setup({
      database: createWorkspaceDatabase({ admin_details: { user: "admin" } }),
    });

    expect(
      await screen.findByTestId("database-connection-health-info"),
    ).toBeInTheDocument();
    expect(screen.getByText("Edit connection details")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove admin connection" }),
    ).toBeInTheDocument();
  });

  it("should disable the toggle and warn when database routing is enabled", () => {
    setup({
      database: createMockDatabase({
        features: ["workspace"],
        router_user_attribute: "some_attribute",
      }),
    });

    expect(
      screen.getByRole("switch", { name: /Enable workspaces/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Workspaces can't be enabled when database routing is enabled.",
      ),
    ).toBeInTheDocument();
  });

  it("should disable the Add connection button when database routing is enabled", () => {
    setup({
      database: createWorkspaceDatabase({
        router_user_attribute: "some_attribute",
      }),
    });

    expect(
      screen.getByRole("button", { name: "Add admin connection" }),
    ).toBeDisabled();
  });

  it("should show an error toast when removing the connection fails", async () => {
    const database = createWorkspaceDatabase({
      admin_details: { user: "admin" },
    });
    setup({ database, withError: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove admin connection" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" }),
    );

    expect(
      await screen.findByText("Failed to remove connection"),
    ).toBeInTheDocument();
  });
});
