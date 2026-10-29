import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseSection } from "./DatabaseSection";

type SetupOpts = {
  database?: Database;
  isAdmin?: boolean;
};

async function setup({
  database = createMockDatabase({
    tables: [createMockTable({ estimated_row_count: 10 })],
  }),
  isAdmin = true,
}: SetupOpts = {}) {
  setupDatabaseEndpoints(database);

  renderWithProviders(<DatabaseSection databaseId={database.id} />, {
    storeInitialState: {
      currentUser: createMockUser({
        is_superuser: isAdmin,
        permissions: { can_access_data_model: true },
      }),
    },
  });

  await screen.findByTestId("database-section");
  return { database };
}

describe("DatabaseSection", () => {
  it("shows the sync, re-scan and edit controls to an admin", async () => {
    await setup({ isAdmin: true });

    expect(
      screen.getByRole("button", { name: /Re-scan field values/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sync now/ }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Database")).not.toHaveAttribute(
      "readonly",
    );
  });

  it("hides the sync and re-scan controls and makes the name read-only for a data-model-only user", async () => {
    await setup({ isAdmin: false });

    expect(
      screen.queryByRole("button", { name: /Re-scan field values/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Sync now/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Database")).toHaveAttribute("readonly");
  });

  it("hides the sync and re-scan controls from an admin on an attached DWH", async () => {
    await setup({
      database: createMockDatabase({ is_attached_dwh: true }),
      isAdmin: true,
    });

    expect(
      screen.queryByRole("button", { name: /Re-scan field values/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Sync now/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Database")).toHaveAttribute("readonly");
  });

  it("fetches the database with its tables but not their fields", async () => {
    const { database } = await setup();

    const call = fetchMock.callHistory.lastCall(
      `path:/api/database/${database.id}`,
    );
    expect(new URL(call?.url ?? "").searchParams.get("include")).toBe("tables");
    expect(screen.queryByText("Fields")).not.toBeInTheDocument();
  });
});
