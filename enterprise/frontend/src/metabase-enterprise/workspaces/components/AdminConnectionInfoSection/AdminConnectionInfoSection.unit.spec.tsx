import { setupDatabaseEndpoints } from "__support__/server-mocks/database";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { AdminConnectionInfoSection } from "./AdminConnectionInfoSection";

interface SetupOpts {
  database?: Database;
}

function setup({
  database = createMockDatabase({ features: ["workspaces"] }),
}: SetupOpts = {}) {
  setupDatabaseEndpoints(database);
  renderWithProviders(<AdminConnectionInfoSection database={database} />);
}

describe("AdminConnectionInfoSection", () => {
  it("should not render for a non-modifiable database (attached DWH)", () => {
    setup({
      database: createMockDatabase({
        is_attached_dwh: true,
        features: ["workspaces"],
      }),
    });

    expect(
      screen.queryByTestId("admin-connection-info-section"),
    ).not.toBeInTheDocument();
  });

  it("should not render when the database does not support the workspaces feature", () => {
    setup({ database: createMockDatabase({ features: [] }) });

    expect(
      screen.queryByTestId("admin-connection-info-section"),
    ).not.toBeInTheDocument();
  });

  it("should render for a modifiable database that supports the workspaces feature", () => {
    setup({
      database: createMockDatabase({
        is_attached_dwh: false,
        features: ["workspaces"],
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
        features: ["workspaces"],
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
        features: ["workspaces"],
      }),
    });

    expect(
      screen.queryByText(
        "Admin connection can't be enabled when Database Routing is enabled.",
      ),
    ).not.toBeInTheDocument();
  });
});
