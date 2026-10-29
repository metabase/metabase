import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import DatabaseDetail from "./DatabaseDetail";

const database = createMockDatabase({ id: 1, name: "Sample Database" });

function setup() {
  setupDatabaseEndpoints(database);
  fetchMock.put(`path:/api/database/${database.id}`, {
    ...database,
    description: "A pretty ok store",
  });

  renderWithProviders(
    <Route path="/" element={<DatabaseDetail database={database} />} />,
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
});
