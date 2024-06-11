import { setupRecentViewsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockRecentTableItem,
  createMockRecentCollectionItem,
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
});
