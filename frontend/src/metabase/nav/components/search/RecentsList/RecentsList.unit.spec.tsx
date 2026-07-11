import fetchMock from "fetch-mock";

import { setupRecentViewsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockRecentCollectionItem,
  createMockRecentTableItem,
} from "metabase-types/api/mocks";

import { RecentsList } from "./RecentsList";

const recentsData = [
  createMockRecentCollectionItem({
    model: "card",
    id: 83,
    timestamp: "2021-08-24T23:50:21.077",
    name: "Question I visited",
    display: "table",
  }),
  createMockRecentCollectionItem({
    model: "dashboard",
    id: 1,
    name: "Dashboard I visited",
    timestamp: "2021-08-24T23:49:34.577",
  }),
  createMockRecentTableItem({
    model: "table",
    id: 4,
    timestamp: "2021-08-24T23:49:34.577",
    name: "table_i_visited",
    display_name: "Table I visited",
  }),
];

async function setup(recents = recentsData) {
  setupRecentViewsEndpoints(recents);

  renderWithProviders(<RecentsList />);

  await screen.findByText("Recently viewed");
}

describe("RecentsList", () => {
  it("shows list of recents", async () => {
    await setup();
    await screen.findByText("Question I visited");
    expect(screen.getByText("Recently viewed")).toBeInTheDocument();

    const [questionType, dashboardType, tableType] = screen.queryAllByTestId(
      "result-link-wrapper",
    );

    expect(screen.getByText("Question I visited")).toBeInTheDocument();
    expect(questionType).toHaveTextContent("Question");

    expect(screen.getByText("Dashboard I visited")).toBeInTheDocument();
    expect(dashboardType).toHaveTextContent("Dashboard");

    expect(screen.getByText("Table I visited")).toBeInTheDocument();
    expect(tableType).toHaveTextContent("Table");
  });

  it("shows an empty state when there are no recents", async () => {
    await setup([]);

    expect(screen.getByText("Recently viewed")).toBeInTheDocument();
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  // Guards metabase#36868: reopening the recents list must refetch rather than
  // serve a stale RTK-Query cache. Mounting/unmounting RecentsList stands in for
  // closing and reopening the search palette; the list must reflect the latest
  // server data (a newly visited item jumping to the top) on remount.
  it("refetches recents on remount instead of serving a stale cache (metabase#36868)", async () => {
    const dashboardItem = createMockRecentCollectionItem({
      model: "dashboard",
      id: 1,
      name: "Dashboard I visited",
      timestamp: "2021-08-24T23:50:21.077",
    });
    const questionItem = createMockRecentCollectionItem({
      model: "card",
      id: 83,
      name: "Question I visited",
      timestamp: "2021-08-24T23:49:34.577",
      display: "table",
    });
    const tableItem = createMockRecentTableItem({
      model: "table",
      id: 4,
      name: "table_i_visited",
      display_name: "Table I visited",
      timestamp: "2021-08-24T23:48:34.577",
    });

    // The response function is re-read on every request, so changing this
    // variable simulates the server returning a freshly reordered list.
    let currentRecents = [dashboardItem, questionItem, tableItem];
    fetchMock.get(/\/api\/activity\/recents/, () => ({
      recents: currentRecents,
    }));

    const { rerender } = renderWithProviders(<RecentsList />);

    await screen.findByText("Recently viewed");
    expect(
      (await screen.findAllByTestId("recently-viewed-item-title"))[0],
    ).toHaveTextContent("Dashboard I visited");

    // Simulate visiting the table: the server now returns it at the top.
    currentRecents = [tableItem, dashboardItem, questionItem];

    // Close (unmount) then reopen (remount) within the same store, keeping the
    // RTK-Query cache warm — the fix forces a refetch here.
    rerender(<></>);
    rerender(<RecentsList />);

    await waitFor(() => {
      expect(
        screen.getAllByTestId("recently-viewed-item-title")[0],
      ).toHaveTextContent("Table I visited");
    });
  });
});
