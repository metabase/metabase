import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen } from "__support__/ui";
import type { DashboardFocus as DashboardFocusResult } from "metabase/api/jev";

import { DashboardFocus } from "./DashboardFocus";
import { clearFocus, getFocusState, setFocus } from "./focus-store";

const FOCUS: DashboardFocusResult = {
  dashboard_id: 1,
  intent: "top vendors",
  available: true,
  cards: [
    {
      dashcard_id: 10,
      card_id: 100,
      tab_id: null,
      title: "Revenue by vendor",
      pos: { row: 0, col: 0, size_x: 12, size_y: 6 },
      score: 2.7,
      focused: true,
    },
  ],
  filters: [
    {
      name: "Vendor",
      type: "string/=",
      slug: "vendor",
      score: 0.9,
      highlight: true,
    },
    {
      name: "State",
      type: "string/=",
      slug: "state",
      score: 0.1,
      highlight: false,
    },
  ],
};

function setup({ dashboardId = 1 }: { dashboardId?: number } = {}) {
  return renderWithProviders(<DashboardFocus dashboardId={dashboardId} />);
}

describe("DashboardFocus", () => {
  beforeEach(() => clearFocus());

  it("renders nothing without an active focus", () => {
    setup();
    expect(screen.queryByTestId("dashboard-focus")).not.toBeInTheDocument();
  });

  it("names the question and the filters that help", () => {
    setup();
    act(() => setFocus(FOCUS));

    expect(screen.getByText("Focused on “top vendors”")).toBeInTheDocument();
    expect(screen.getByText("Vendor")).toBeInTheDocument();
    expect(screen.queryByText("State")).not.toBeInTheDocument();
  });

  it("clears the focus", async () => {
    setup();
    act(() => setFocus(FOCUS));

    await userEvent.click(screen.getByRole("button", { name: "Clear focus" }));

    expect(getFocusState().active).toBe(false);
    expect(screen.queryByTestId("dashboard-focus")).not.toBeInTheDocument();
  });

  it("ignores a focus for another dashboard", () => {
    setup({ dashboardId: 2 });
    act(() => setFocus(FOCUS));

    expect(screen.queryByTestId("dashboard-focus")).not.toBeInTheDocument();
  });

  it("clears the focus when the dashboard goes away", () => {
    const { unmount } = setup();
    act(() => setFocus(FOCUS));

    unmount();

    expect(getFocusState().active).toBe(false);
  });
});
