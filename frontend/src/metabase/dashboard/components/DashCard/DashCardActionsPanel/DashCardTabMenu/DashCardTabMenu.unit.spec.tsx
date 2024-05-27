import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { getDefaultTab } from "metabase/dashboard/actions";
import type { DashboardTab } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import { DashCardTabMenu } from "./DashCardTabMenu";

const DASHCARD = createMockDashboardCard();

const TEST_DASHBOARD = createMockDashboard({
  dashcards: [DASHCARD],
});

const TAB_1 = getDefaultTab({ tabId: 1, dashId: 1, name: "Tab 1" });
const TAB_2 = getDefaultTab({ tabId: 2, dashId: 1, name: "Tab 2" });
const TAB_3 = getDefaultTab({ tabId: 3, dashId: 1, name: "Tab 3" });

const setup = ({
  tabs = [TAB_1, TAB_2, TAB_3],
  selectedTab = TAB_1,
}: {
  tabs?: DashboardTab[];
  selectedTab?: DashboardTab;
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
        dashcards: TEST_DASHBOARD.dashcards.map(c => c.id),
        tabs,
      },
    },
  });

  return renderWithProviders(
    <DashCardTabMenu
      dashCardId={DASHCARD.id}
      onClose={jest.fn()}
      onOpen={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        dashboard,
      }),
    },
  );
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

      await userEvent.hover(getIconButton());

      const menu = await waitFor(() => screen.findByRole("menu"));

      expect(within(menu).queryByText(TAB_1.name)).not.toBeInTheDocument();

      expect(within(menu).getByText(TAB_2.name)).toBeInTheDocument();
      expect(within(menu).getByText(TAB_3.name)).toBeInTheDocument();
    });
  });
});

const getIconButton = () => screen.getByLabelText("move_card icon");
