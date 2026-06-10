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
      screen.getByRole("switch", { name: /Enable Workspaces/i }),
    ).toBeChecked();
    expect(
      screen.getByText("Workspace database connection"),
    ).toBeInTheDocument();
  });

  it("should persist the setting and expand the section when enabling Workspaces", async () => {
    const database = createMockDatabase({ features: ["workspace"] });
    setup({ database });

    const toggle = screen.getByRole("switch", { name: /Enable Workspaces/i });
    await userEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(
      await screen.findByText("Workspace database connection"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.calls(`path:/api/database/${database.id}`, { method: "PUT" }),
      ).toHaveLength(1);
    });
    const [, options] = fetchMock.lastCall(
      `path:/api/database/${database.id}`,
      {
        method: "PUT",
      },
    )!;
    expect(JSON.parse(options?.body as string)).toEqual({
      settings: { "database-enable-workspaces": true },
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
        "Used to create isolated schemas and temporary users for workspace settings.",
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

  it("should warn when Workspaces are disabled but a connection still exists", () => {
    setup({
      database: createMockDatabase({
        features: ["workspace"],
        settings: { "database-enable-workspaces": false },
        admin_details: { user: "admin" },
      }),
    });

    expect(
      screen.getByText("Workspaces are currently disabled"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A workspace connection is configured and will be reused if Workspaces are enabled again.",
      ),
    ).toBeInTheDocument();
  });

  it("should not warn when Workspaces are enabled and a connection exists", () => {
    setup({
      database: createMockDatabase({
        features: ["workspace"],
        settings: { "database-enable-workspaces": true },
        admin_details: { user: "admin" },
      }),
    });

    expect(
      screen.queryByText("Workspaces are currently disabled"),
    ).not.toBeInTheDocument();
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
