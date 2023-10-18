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
    dashcards: {
      [DASHCARD.id]: DASHCARD,
    },
    dashboards: {
      [TEST_DASHBOARD.id]: {
        ...TEST_DASHBOARD,
        ordered_cards: TEST_DASHBOARD.ordered_cards.map(c => c.id),
        ordered_tabs: tabs,
      },
    },
  });

  return renderWithProviders(<DashCardTabMenu dashCardId={DASHCARD.id} />, {
    storeInitialState: createMockState({
      dashboard,
    }),
  });
};

describe("DashCardTabMenu", () => {
  it("when there is only one tab it should not show the menu at all", () => {
    setup({ tabs: [] });

    expect(screen.queryByText("Move to")).not.toBeInTheDocument();
  });

  describe("when there are exactly two tabs", () => {
    it("should show the move card button", () => {
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

      expect(within(menu).queryByText(TAB_1.name)).not.toBeInTheDocument();

      expect(within(menu).getByText(TAB_2.name)).toBeInTheDocument();
      expect(within(menu).getByText(TAB_3.name)).toBeInTheDocument();
    });
  });

  describe("when selecting tab name from the menu", () => {
    it("should move the card to the selected tab", async () => {
      const { store } = setup({});

      await clickOnTabMenuItem(TAB_3.name);

      expect(
        store.getState().dashboard.dashcards[DASHCARD.id].dashboard_tab_id,
      ).toBe(TAB_3.id);
    });

    it("should stay on the current tab", async () => {
      const { store } = setup({});

      clickOnTabMenuItem(TAB_3.name);

      expect(store.getState().dashboard.selectedTabId).toBe(TAB_1.id);
    });

    it("should keep the query of the card the same", async () => {
      const { store } = setup({});

      await clickOnTabMenuItem(TAB_3.name);

      expect(
        store.getState().dashboard.dashcards[DASHCARD.id].card.dataset_query,
      ).toBe(DASHCARD.card.dataset_query);
    });

    it("should keep the size of the card the same", async () => {
      const { store } = setup({});

      await clickOnTabMenuItem(TAB_3.name);

      expect(store.getState().dashboard.dashcards[DASHCARD.id].size_x).toBe(
        DASHCARD.size_x,
      );
      expect(store.getState().dashboard.dashcards[DASHCARD.id].size_y).toBe(
        DASHCARD.size_y,
      );
    });
  });
});

const getIconButton = () => screen.getByLabelText("move_card icon");

const clickOnTabMenuItem = async (tabName: string) => {
  userEvent.hover(getIconButton());

  const menu = await waitFor(() => screen.findByRole("menu"));

  userEvent.click(within(menu).getByText(tabName));
};
