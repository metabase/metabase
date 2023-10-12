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

      expect(screen.getByText("Tab 2")).toBeInTheDocument();
    });

    it('should not show the "chevron" button', () => {
      setup({ tabs: [TAB_1, TAB_2] });
      expect(queryChevronButton()).not.toBeInTheDocument();
    });
  });

  describe("when there are more than two tabs", () => {
    it('should show the "chevron" button', () => {
      setup({});

      expect(getChevronButton()).toBeInTheDocument();
    });

    it("should not show tab 3 when the menu is closed", () => {
      setup({});

      expect(screen.queryByText("Tab 3")).not.toBeInTheDocument();
    });

    it("should suggest moving to the second tab", () => {
      setup({});

      expect(screen.getByText("Tab 2")).toBeInTheDocument();
    });

    it("should show tabs 2 and 3 in the menu", async () => {
      setup({});

      userEvent.click(getChevronButton());

      const menu = await waitFor(() => screen.findByRole("menu"));

      expect(within(menu).getByText("Tab 2")).toBeInTheDocument();
      expect(within(menu).getByText("Tab 3")).toBeInTheDocument();
    });
  });

  // TODO: select tab behaviour

  // TODO: permissions tests
});

const getChevronButton = () => screen.getByLabelText("chevrondown icon");
const queryChevronButton = () => screen.queryByLabelText("chevrondown icon");
