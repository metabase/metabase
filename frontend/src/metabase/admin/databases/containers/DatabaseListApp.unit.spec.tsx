import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockEngines,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseListApp } from "./DatabaseListApp";

const setup = () => {
  setupDatabaseListEndpoint([
    createMockDatabase({ id: 1, name: "Stubbed DB", is_stub: true }),
  ]);
  setupEnginesEndpoint(createMockEngines());

  renderWithProviders(<DatabaseListApp />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    }),
  });
};

describe("DatabaseListApp", () => {
  it("requests stub databases so they can be listed", async () => {
    setup();

    expect(await screen.findByText("Stubbed DB")).toBeInTheDocument();
    const [call] = fetchMock.callHistory.calls("path:/api/database");
    expect(new URL(call.url).searchParams.get("include_stubs")).toBe("true");
  });
});
