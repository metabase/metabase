import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import DatabaseDetail from "./DatabaseDetail";

const database = createMockDatabase({ id: 1, name: "Sample Database" });

type SetupOpts = {
  testDatabase?: Database;
};

function setup({ testDatabase = database }: SetupOpts = {}) {
  setupDatabaseEndpoints(testDatabase);
  fetchMock.put(`path:/api/database/${testDatabase.id}`, {
    ...testDatabase,
    description: "A pretty ok store",
  });

  renderWithProviders(
    <Route path="/" element={<DatabaseDetail database={testDatabase} />} />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("DatabaseDetail", () => {
  it("sends the edited description to the api", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    await userEvent.type(
      screen.getByPlaceholderText("No description yet"),
      "A pretty ok store",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/database/${database.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });

    const [call] = fetchMock.callHistory.calls(
      `path:/api/database/${database.id}`,
      { method: "PUT" },
    );
    expect(JSON.parse(String(call.options.body))).toEqual({
      description: "A pretty ok store",
    });
  });

  it("leaves edit mode on cancel without saving and shows the original value on the next edit", async () => {
    setup({
      testDatabase: createMockDatabase({
        id: 1,
        name: "Sample Database",
        points_of_interest: "Original note",
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    await userEvent.type(
      screen.getByPlaceholderText("Nothing interesting yet"),
      "Turns out it's not",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByRole("button", { name: /Edit/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Turns out it's not/)).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(`path:/api/database/${database.id}`, {
        method: "PUT",
      }),
    ).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(screen.getByPlaceholderText("Nothing interesting yet")).toHaveValue(
      "Original note",
    );
  });
});
