import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";

// import { RELOAD_INTERVAL } from "../../constants";

import TableBrowser from "./TableBrowser";

describe("TableBrowser", () => {
  it("should poll until tables have completed initial sync", async () => {
    // initially, initial_sync_status='incomplete'
    fetchMock.get(
      "path:/api/database/1/schema/public",
      [{ id: 123, name: "foo", initial_sync_status: "incomplete" }],
      { name: "database-get-schema" },
    );
    fetchMock.get("path:/api/database/1", [
      { id: 123, name: "bar", initial_sync_status: "complete" },
    ]);
    renderWithProviders(<TableBrowser dbId={1} schemaName="public" />);
    await waitFor(() => {
      expect(screen.getByText("foo")).toBeInTheDocument();
    });
    // check only one call has been made
    const calls = fetchMock.callHistory.calls(
      "path:/api/database/1/schema/public",
    );
    expect(calls.length).toBe(1);
    // check the loading spinner is present
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    // change the table to have initial_sync_status='complete'
    fetchMock.modifyRoute("database-get-schema", {
      response: [{ id: 123, name: "foo", initial_sync_status: "complete" }],
    });
    await waitFor(
      () => {
        expect(
          fetchMock.callHistory.calls("path:/api/database/1/schema/public")
            .length,
        ).toBe(2);
      },
      { timeout: 3000 },
    );
    await waitForLoaderToBeRemoved();
  });
});
