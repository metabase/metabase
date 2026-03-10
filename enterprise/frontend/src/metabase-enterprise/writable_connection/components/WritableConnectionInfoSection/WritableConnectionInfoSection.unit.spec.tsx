import { setupDatabaseEndpoints } from "__support__/server-mocks/database";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { WritableConnectionInfoSection } from "./WritableConnectionInfoSection";

interface SetupOpts {
  database?: Database;
}

function setup({ database = createMockDatabase() }: SetupOpts = {}) {
  setupDatabaseEndpoints(database);
  renderWithProviders(<WritableConnectionInfoSection database={database} />);
}

describe("WritableConnectionInfoSection", () => {
  it("should not render for a non-modifiable database (attached DWH)", () => {
    setup({ database: createMockDatabase({ is_attached_dwh: true }) });

    expect(
      screen.queryByTestId("writable-connection-info-section"),
    ).not.toBeInTheDocument();
  });

  it("should render for a modifiable database", () => {
    setup({ database: createMockDatabase({ is_attached_dwh: false }) });

    expect(
      screen.getByTestId("writable-connection-info-section"),
    ).toBeInTheDocument();
  });

  it("should show a warning when database routing is enabled", () => {
    setup({
      database: createMockDatabase({
        router_user_attribute: "some_attribute",
      }),
    });

    expect(
      screen.getByText(
        "Writable connection can't be enabled when Database Routing is enabled.",
      ),
    ).toBeInTheDocument();
  });

  it("should not show a warning when database routing is not enabled", () => {
    setup({
      database: createMockDatabase({ router_user_attribute: null }),
    });

    expect(
      screen.queryByText(
        "Writable connection can't be enabled when Database Routing is enabled.",
      ),
    ).not.toBeInTheDocument();
  });
});
