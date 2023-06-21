import fetchMock from "fetch-mock";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "__support__/ui";
import { RELOAD_INTERVAL } from "../../constants";
import TableBrowser from "./TableBrowser";

describe("TableBrowser", () => {
  it("should poll until tables have completed initial sync", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    // initially, initial_sync_status='incomplete'
    fetchMock.get("path:/api/database/1/schema/public", [
      { id: 123, name: "foo", initial_sync_status: "incomplete" },
    ]);
    fetchMock.get("path:/api/database/1", [
      { id: 123, name: "bar", initial_sync_status: "complete" },
    ]);
    renderWithProviders(<TableBrowser dbId={1} schemaName="public" />);
    await waitFor(() => {
      expect(screen.getByText("foo")).toBeInTheDocument();
    });
    // check only one call has been made
    const calls = await fetchMock.calls(/\/api\/database\/1\/schema\/public/);
    expect(calls.length).toBe(1);
    // check the loading spinner is present
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    // change the table to have initial_sync_status='complete'
    fetchMock.get(
      "path:/api/database/1/schema/public",
      [{ id: 123, name: "foo", initial_sync_status: "complete" }],
      { overwriteRoutes: true },
    );
    // advance the timer
    jest.advanceTimersByTime(RELOAD_INTERVAL);
    // wait for the response
    await waitFor(async () => {
      const calls2 = await fetchMock.calls(
        /\/api\/database\/1\/schema\/public/,
      );
      expect(calls2.length).toBe(2);
    });
    // wait for the loading spinner to disapear
    await waitFor(() => {
      expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
    });
  });
});
