import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import { NewActionPage } from "./NewActionPage";

type SetupOpts = {
  isAdmin: boolean;
};

function setup({ isAdmin }: SetupOpts) {
  setupDatabasesEndpoints([
    createMockDatabase({
      native_permissions: "write",
      settings: { "database-enable-actions": true },
    }),
  ]);

  renderWithProviders(<Route path="/" element={<NewActionPage />} />, {
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
}

describe("NewActionPage", () => {
  it("doesn't let non-admins create an action", async () => {
    setup({ isAdmin: false });

    expect(
      await screen.findByText("Only admins can create actions."),
    ).toBeInTheDocument();
  });
});
