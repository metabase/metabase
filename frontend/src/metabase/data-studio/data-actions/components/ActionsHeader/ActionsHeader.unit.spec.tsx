import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { ActionsHeader } from "./ActionsHeader";

function setup(database: Database) {
  setupDatabasesEndpoints([database]);
  renderWithProviders(<ActionsHeader />, { withRouter: true });
}

describe("ActionsHeader", () => {
  it("should link to the new action page with an eligible database", async () => {
    setup(
      createMockDatabase({
        native_permissions: "write",
        settings: { "database-enable-actions": true },
      }),
    );

    expect(
      await screen.findByRole("link", { name: /New action/ }),
    ).toBeInTheDocument();
  });

  it("should disable the button without an eligible database", async () => {
    setup(
      createMockDatabase({
        native_permissions: "none",
        settings: { "database-enable-actions": true },
      }),
    );

    expect(
      await screen.findByRole("button", { name: /New action/ }),
    ).toBeDisabled();
  });
});
