import React from "react";
import { render, screen, waitFor } from "__support__/ui";
import xhrMock from "xhr-mock";
import RecentsList from "./RecentsList";

const recentsData = [
  {
    user_id: 1,
    model: "card",
    model_id: 83,
    cnt: 9,
    max_ts: "2021-08-24T23:50:21.077",
    model_object: {
      id: 83,
      name: "Question I visited",
      display: "table",
    },
  },
  {
    user_id: 1,
    model: "dashboard",
    model_id: 1,
    cnt: 164,
    max_ts: "2021-08-24T23:49:34.577",
    model_object: {
      id: 1,
      name: "Dashboard I visited",
    },
  },
  {
    user_id: 1,
    model: "table",
    model_id: 4,
    cnt: 164,
    max_ts: "2021-08-24T23:49:34.577",
    model_object: {
      id: 1,
      name: "table_i_visited",
      display_name: "Table I visited",
    },
  },
];

function mockRecentsEndpoint(recents) {
  xhrMock.get("/api/activity/recent_views", {
    body: JSON.stringify(recents),
  });
}

async function setup(recents = recentsData) {
  mockRecentsEndpoint(recents);

  render(<RecentsList />);

  await waitFor(() => screen.queryByText("Recently viewed"));
}

describe("RecentsList", () => {
  beforeEach(() => {
    xhrMock.setup();
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("shows list of recents", async () => {
    await setup();
    await waitFor(() => screen.queryByText("Question I visited"));
    expect(screen.queryByText("Recently viewed")).toBeInTheDocument();

    const [questionType, dashboardType, tableType] = screen.queryAllByTestId(
      "recently-viewed-item-type",
    );

    expect(screen.queryByText("Question I visited")).toBeInTheDocument();
    expect(questionType).toHaveTextContent("Question");

    expect(screen.queryByText("Dashboard I visited")).toBeInTheDocument();
    expect(dashboardType).toHaveTextContent("Dashboard");

    expect(screen.queryByText("Table I visited")).toBeInTheDocument();
    expect(tableType).toHaveTextContent("Table");
  });

  it("shows an empty state when there are no recents", async () => {
    await setup([]);

    expect(screen.queryByText("Recently viewed")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here")).toBeInTheDocument();
  });
});
