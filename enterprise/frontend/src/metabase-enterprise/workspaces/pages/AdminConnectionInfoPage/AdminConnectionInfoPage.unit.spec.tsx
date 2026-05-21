import { Route } from "react-router";

import { setupDatabaseEndpoints } from "__support__/server-mocks/database";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
} from "metabase-types/api/mocks";

import { AdminConnectionInfoPage } from "./AdminConnectionInfoPage";

function setup({ database }: { database: Database }) {
  setupDatabaseEndpoints(database);

  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <AdminConnectionInfoPage
          params={{ databaseId: String(database.id) }}
          route={{ path: "/" } as unknown as Route}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        settings: createMockSettingsState(createMockSettings()),
      },
    },
  );
}

describe("AdminConnectionInfoPage", () => {
  it("renders the 'Add' title when the database has no admin connection yet", async () => {
    setup({
      database: createMockDatabase({ id: 1, name: "PG", admin_details: null }),
    });

    expect(
      await screen.findByRole("heading", { name: "Add admin connection" }),
    ).toBeInTheDocument();
  });

  it("renders the 'Edit' title when the database already has admin connection details", async () => {
    setup({
      database: createMockDatabase({
        id: 1,
        name: "PG",
        admin_details: { user: "admin" },
      }),
    });

    expect(
      await screen.findByRole("heading", {
        name: "Edit admin connection details",
      }),
    ).toBeInTheDocument();
  });
});
