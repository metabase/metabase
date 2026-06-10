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

  it("should render the enable toggle for a modifiable database that supports the workspace feature", () => {
    setup({
      database: createMockDatabase({
        is_attached_dwh: false,
        features: ["workspace"],
      }),
    });

    expect(
      screen.getByTestId("workspace-database-section"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Enable Workspaces/i }),
    ).not.toBeChecked();
  });

  it("should reflect the persisted enabled setting and stay expanded", () => {
    setup({
      database: createMockDatabase({
        features: ["workspace"],
        settings: { "database-enable-workspaces": true },
      }),
    });

    expect(
      screen.getByRole("switch", { name: "Enable workspaces" }),
    ).toBeChecked();
    expect(screen.getByText("Admin database connection")).toBeInTheDocument();
  });

  it("should persist the setting and expand the section when enabling Workspaces", async () => {
    const database = createMockDatabase({ features: ["workspace"] });
    setup({ database });

    const toggle = screen.getByRole("switch", { name: /Enable Workspaces/i });
    await userEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(
      await screen.findByText("Admin database connection"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(`path:/api/database/${database.id}`, {
          method: "PUT",
        }),
      ).toBe(true);
    });
  });

  it("should show the description and an Add connection link when no connection is configured", () => {
    setup({
      database: createMockDatabase({
        features: ["workspace"],
        settings: { "database-enable-workspaces": true },
      }),
    });

    expect(
      screen.getByText(
        "Used to create isolated schemas and temporary users for workspaces.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Add connection" }),
    ).toBeInTheDocument();
  });

  it("should show the connection status with Edit and Remove buttons when a connection is configured", async () => {
    setup({
      database: createMockDatabase({
        features: ["workspace"],
        settings: { "database-enable-workspaces": true },
        admin_details: { user: "admin" },
      }),
    });

    expect(
      await screen.findByTestId("database-connection-health-info"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove connection" }),
    ).toBeInTheDocument();
  });

  it("should disable the Add connection button when database routing is enabled", () => {
    setup({
      database: createMockDatabase({
        features: ["workspace"],
        settings: { "database-enable-workspaces": true },
        router_user_attribute: "some_attribute",
      }),
    });

    expect(
      screen.getByRole("button", { name: "Add connection" }),
    ).toBeDisabled();
  });

  it("should show an error toast when removing the connection fails", async () => {
    const database = createMockDatabase({
      features: ["workspace"],
      settings: { "database-enable-workspaces": true },
      admin_details: { user: "admin" },
    });
    setup({ database, withError: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove connection" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" }),
    );

    expect(
      await screen.findByText("Failed to remove connection"),
    ).toBeInTheDocument();
  });
});
