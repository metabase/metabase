import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { Bookmark } from "metabase-types/api";
import {
  createMockBookmark,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { DashboardBookmark } from "./DashboardBookmark";

const DASHBOARD_ID = 1;
const DASHBOARD = createMockDashboard({ id: DASHBOARD_ID, name: "Sales" });

const setup = () => {
  const bookmarks: Bookmark[] = [];

  fetchMock.get("path:/api/bookmark", () => bookmarks);
  fetchMock.post(`path:/api/bookmark/dashboard/${DASHBOARD_ID}`, () => {
    const bookmark = createMockBookmark({
      id: `dashboard-${DASHBOARD_ID}`,
      type: "dashboard",
      item_id: DASHBOARD_ID,
      name: DASHBOARD.name,
    });
    bookmarks.push(bookmark);
    return bookmark;
  });

  renderWithProviders(
    <MockDashboardContext dashboardId={DASHBOARD_ID} dashboard={DASHBOARD}>
      <DashboardBookmark />
    </MockDashboardContext>,
  );
};

describe("DashboardBookmark", () => {
  it("should show the dashboard as bookmarked after bookmarking it", async () => {
    setup();
    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/bookmark")).toHaveLength(1),
    );

    await userEvent.click(screen.getByRole("button", { name: "Bookmark" }));

    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/bookmark")).toHaveLength(2),
    );
    expect(
      await screen.findByRole("button", { name: "Remove from bookmarks" }),
    ).toBeInTheDocument();
  });
});
