import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCreateBookmarkEndpoint,
  setupDeleteBookmarkEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { Bookmark } from "metabase-types/api";
import {
  createMockBookmark,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { DashboardBookmark } from "./DashboardBookmark";

const DASHBOARD_ID = 10;

const DASHBOARD = createMockDashboard({
  id: DASHBOARD_ID,
  name: "Orders dashboard",
});

const DASHBOARD_BOOKMARK = createMockBookmark({
  id: "dashboard-10",
  type: "dashboard",
  item_id: DASHBOARD_ID,
  name: DASHBOARD.name,
});

interface SetupOpts {
  bookmarks?: Bookmark[];
}

const setup = ({ bookmarks = [] }: SetupOpts = {}) => {
  const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
  setupBookmarksEndpoints(bookmarks);
  setupCreateBookmarkEndpoint({ type: "dashboard", item_id: DASHBOARD_ID });
  setupDeleteBookmarkEndpoint({ type: "dashboard", item_id: DASHBOARD_ID });

  renderWithProviders(
    <MockDashboardContext dashboard={DASHBOARD}>
      <DashboardBookmark />
    </MockDashboardContext>,
  );

  return { trackSimpleEvent };
};

const bookmarkCalls = (method: "POST" | "DELETE") =>
  fetchMock.callHistory.calls(`path:/api/bookmark/dashboard/${DASHBOARD_ID}`, {
    method,
  });

describe("DashboardBookmark", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("bookmarks the dashboard and tracks it", async () => {
    const { trackSimpleEvent } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Bookmark" }),
    );

    await waitFor(() => expect(bookmarkCalls("POST")).toHaveLength(1));
    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "bookmark_added",
      event_detail: "dashboard",
      triggered_from: "dashboard_header",
    });
  });

  it("removes the bookmark without tracking it", async () => {
    const { trackSimpleEvent } = setup({ bookmarks: [DASHBOARD_BOOKMARK] });

    await userEvent.click(
      await screen.findByRole("button", { name: "Remove from bookmarks" }),
    );

    await waitFor(() => expect(bookmarkCalls("DELETE")).toHaveLength(1));
    expect(bookmarkCalls("POST")).toHaveLength(0);
    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });
});
