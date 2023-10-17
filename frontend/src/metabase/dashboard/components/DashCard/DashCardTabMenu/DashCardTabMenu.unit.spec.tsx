import userEvent from "@testing-library/user-event";
import type { DashboardOrderedTab } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardOrderedCard,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";
import { getDefaultTab } from "metabase/dashboard/actions";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { DashCardTabMenu } from "./DashCardTabMenu";

const DASHCARD = createMockDashboardOrderedCard();

const TEST_DASHBOARD = createMockDashboard({
  ordered_cards: [DASHCARD],
});

const TAB_1 = getDefaultTab({ tabId: 1, dashId: 1, name: "Tab 1" });
const TAB_2 = getDefaultTab({ tabId: 2, dashId: 1, name: "Tab 2" });
const TAB_3 = getDefaultTab({ tabId: 3, dashId: 1, name: "Tab 3" });

const setup = ({
  tabs = [TAB_1, TAB_2, TAB_3],
  selectedTab = TAB_1,
}: {
  tabs?: DashboardOrderedTab[];
  selectedTab?: DashboardOrderedTab;
}) => {
  const dashboard = createMockDashboardState({
    dashboardId: TEST_DASHBOARD.id,
    selectedTabId: selectedTab.id,
    dashboards: {
      [TEST_DASHBOARD.id]: {
        ...TEST_DASHBOARD,
        ordered_cards: TEST_DASHBOARD.ordered_cards.map(c => c.id),
        ordered_tabs: tabs,
      },
    },
  });

  return renderWithProviders(<DashCardTabMenu dashCardId={123} />, {
    storeInitialState: createMockState({ dashboard }),
  });
};

describe("DashCardTabMenu", () => {
  it("when there is only one tab it should not show the menu at all", () => {
    setup({ tabs: [] });

    expect(screen.queryByText("Move to")).not.toBeInTheDocument();
  });

  describe("when there are exactly two tabs", () => {
    it("should show the button to move to the second", () => {
      setup({ tabs: [TAB_1, TAB_2] });

      expect(getIconButton()).toBeInTheDocument();
    });
  });

  describe("when there are more than two tabs", () => {
    it("should show the move card button", () => {
      setup({});

      expect(getIconButton()).toBeInTheDocument();
    });

    it("should show tabs other than the current one as options when hovering the button", async () => {
      setup({});

      userEvent.hover(getIconButton());

      const menu = await waitFor(() => screen.findByRole("menu"));

      expect(within(menu).getByText("Tab 2")).toBeInTheDocument();
      expect(within(menu).getByText("Tab 3")).toBeInTheDocument();
    });
  });
});

const getIconButton = () => screen.getByLabelText("move_card icon");
