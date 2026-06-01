import userEvent from "@testing-library/user-event";

import {
  setupDatabaseHealthcheckEndpoint,
  setupUpdateDatabaseEndpoint,
  setupUpdateDatabaseEndpointError,
} from "__support__/server-mocks/database";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { AdminConnectionInfoSection } from "./AdminConnectionInfoSection";

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
      <AdminConnectionInfoSection database={database} />
      <UndoListing />
    </>,
  );
}

describe("AdminConnectionInfoSection", () => {
  it("should not render for a non-modifiable database (attached DWH)", () => {
    setup({
      database: createMockDatabase({
        is_attached_dwh: true,
        features: ["workspace"],
      }),
    });

    expect(
      screen.queryByTestId("admin-connection-info-section"),
    ).not.toBeInTheDocument();
  });

  it("should not render when the database does not support the workspace feature", () => {
    setup({ database: createMockDatabase({ features: [] }) });

    expect(
      screen.queryByTestId("admin-connection-info-section"),
    ).not.toBeInTheDocument();
  });

  it("should render for a modifiable database that supports the workspace feature", () => {
    setup({
      database: createMockDatabase({
        is_attached_dwh: false,
        features: ["workspace"],
      }),
    });

    expect(
      screen.getByTestId("admin-connection-info-section"),
    ).toBeInTheDocument();
  });

  it("should show a warning when database routing is enabled", () => {
    setup({
      database: createMockDatabase({
        router_user_attribute: "some_attribute",
        features: ["workspace"],
      }),
    });

    expect(
      screen.getByText(
        "Admin connection can't be enabled when Database Routing is enabled.",
      ),
    ).toBeInTheDocument();
  });

  it("should not show a warning when database routing is not enabled", () => {
    setup({
      database: createMockDatabase({
        router_user_attribute: null,
        features: ["workspace"],
      }),
    });

    expect(
      screen.queryByText(
        "Admin connection can't be enabled when Database Routing is enabled.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should show an error toast when removing the admin connection fails", async () => {
    const database = createMockDatabase({
      features: ["workspace"],
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
      await screen.findByText("Failed to remove admin connection"),
    ).toBeInTheDocument();
  });
});
