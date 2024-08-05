/* eslint-disable jest/expect-expect */
/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectButtonInHeader"] }] */
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupBookmarksEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { DashboardActionKey } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import { checkNotNull } from "metabase/lib/types";
import type { IconName } from "metabase/ui";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "metabase-types/store/mocks";

import { DashboardHeaderButtonRow } from "./DashboardHeaderButtonRow";
import { DASHBOARD_ACTION } from "./action-buttons";
import { DASHBOARD_EDITING_ACTIONS, DASHBOARD_VIEW_ACTIONS } from "./constants";

const DASHBOARD_EXPECTED_DATA_MAP: Record<
  DashboardActionKey,
  | {
      icon: IconName;
      tooltip: string | null;
    }
  | Record<string, never>
> = {
  [DASHBOARD_ACTION.ADD_QUESTION]: {
    icon: "add",
    tooltip: "Add questions",
  },
  [DASHBOARD_ACTION.ADD_HEADING_OR_TEXT]: {
    icon: "string",
    tooltip: "Add a heading or text",
  },
  [DASHBOARD_ACTION.ADD_LINK_CARD]: {
    icon: "link",
    tooltip: "Add link card",
  },
  [DASHBOARD_ACTION.ADD_SECTION]: {
    icon: "section",
    tooltip: "Add section",
  },
  [DASHBOARD_ACTION.ADD_TEMPORAL_UNIT]: {
    icon: "clock",
    tooltip: "Add a Unit of Time widget",
  },
  [DASHBOARD_ACTION.ADD_FILTER_PARAMETER]: {
    icon: "filter",
    tooltip: "Add a filter",
  },
  [DASHBOARD_ACTION.ADD_ACTION_ELEMENT]: {
    icon: "click",
    tooltip: "Add action button",
  },
  [DASHBOARD_ACTION.EXTRA_EDIT_BUTTONS_MENU]: {
    icon: "ellipsis",
    tooltip: "Toggle width",
  },
  [DASHBOARD_ACTION.COPY_ANALYTICS_DASHBOARD]: {
    icon: "clone",
    tooltip: null,
  },
  [DASHBOARD_ACTION.EDIT_DASHBOARD]: {
    icon: "pencil",
    tooltip: "Edit dashboard",
  },
  [DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTION]: {
    icon: "subscription",
    tooltip: "Subscriptions",
  },
  [DASHBOARD_ACTION.DASHBOARD_EMBED_ACTION]: {
    icon: "share",
    tooltip: "Embedding",
  },
  [DASHBOARD_ACTION.REFRESH_WIDGET]: {
    icon: "clock",
    tooltip: "Auto-refresh",
  },
  [DASHBOARD_ACTION.NIGHT_MODE_TOGGLE]: {
    icon: "moon",
    tooltip: "Nighttime mode",
  },
  [DASHBOARD_ACTION.FULLSCREEN_TOGGLE]: {
    icon: "expand",
    tooltip: "Enter fullscreen",
  },
  [DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER]: {},
  [DASHBOARD_ACTION.DASHBOARD_BOOKMARK]: {
    icon: "bookmark",
    tooltip: "Bookmark",
  },
  [DASHBOARD_ACTION.DASHBOARD_INFO]: {
    icon: "info",
    tooltip: "More info",
  },
  [DASHBOARD_ACTION.DASHBOARD_ACTION_MENU]: {
    icon: "ellipsis",
    tooltip: "Move, trash, and more…",
  },
  [DASHBOARD_ACTION.FULLSCREEN_ANALYTICS_DASHBOARD]: {
    icon: "expand",
    tooltip: "Enter Fullscreen",
  },
};

const setup = ({
  isEditing,
  hasModelActionsEnabled,
  isFullscreen = false,
  isPublic,
  isAnalyticsDashboard,
  hasNightModeToggle = true,
  isNightMode = false,
  isAdmin = false,
}: Partial<{
  isEditing: boolean;
  hasModelActionsEnabled: boolean;
  isFullscreen: boolean;
  isPublic: boolean;
  isAnalyticsDashboard: boolean;
  hasNightModeToggle: boolean;
  isNightMode: boolean;
  isAdmin: boolean;
}>) => {
  setupBookmarksEndpoints([]);

  const MOCK_DATABASE = createMockDatabase({
    settings: {
      "database-enable-actions": hasModelActionsEnabled,
    },
  });

  const MOCK_DASHCARD = createMockDashboardCard();
  const MOCK_DASHBOARD = createMockDashboard({
    dashcards: [MOCK_DASHCARD],
  });
  const MOCK_STORE_DASHBOARD = createMockStoreDashboard({
    ...MOCK_DASHBOARD,
    dashcards: MOCK_DASHBOARD.dashcards.map(dc => dc.id),
    tabs: [],
  });
  const MOCK_DASH_STATE = createMockDashboardState({
    dashboardId: MOCK_DASHBOARD.id,
    dashboards: {
      [MOCK_STORE_DASHBOARD.id]: {
        ...MOCK_STORE_DASHBOARD,
      },
    },
    dashcards: {
      [MOCK_DASHCARD.id]: MOCK_DASHCARD,
    },
    editingDashboard: isEditing ? MOCK_DASHBOARD : null,
  });

  return renderWithProviders(
    <Route
      path="*"
      component={() => (
        <DashboardHeaderButtonRow
          canResetFilters
          onResetFilters={jest.fn()}
          refreshPeriod={null}
          onRefreshPeriodChange={jest.fn()}
          setRefreshElapsedHook={jest.fn()}
          isFullscreen={isFullscreen}
          onFullscreenChange={jest.fn()}
          hasNightModeToggle={hasNightModeToggle}
          onNightModeChange={jest.fn()}
          isNightMode={isNightMode}
          isPublic={isPublic}
          isAnalyticsDashboard={isAnalyticsDashboard}
        />
      )}
    ></Route>,
    {
      storeInitialState: {
        dashboard: MOCK_DASH_STATE,
        entities: createMockEntitiesState({
          databases: [MOCK_DATABASE],
        }),
        currentUser: createMockUser({
          is_superuser: isAdmin,
        }),
      },
      withRouter: true,
    },
  );
};

const expectButtonInHeader = async ({
  button,
  action,
}: {
  button: HTMLElement;
  action: DashboardActionKey;
}) => {
  expect(
    within(button).getByLabelText(
      `${DASHBOARD_EXPECTED_DATA_MAP[action].icon} icon`,
    ),
  ).toBeInTheDocument();

  await userEvent.hover(
    within(button).getByLabelText(
      `${DASHBOARD_EXPECTED_DATA_MAP[action].icon} icon`,
    ),
  );
  const { tooltip } = DASHBOARD_EXPECTED_DATA_MAP[action];
  expect(screen.getByText(checkNotNull(tooltip))).toBeInTheDocument();
};

const expectButtonsToBeInHeader = async ({
  expectedButtons,
}: {
  expectedButtons: DashboardActionKey[];
}) => {
  const buttons = screen.getAllByTestId("dashboard-header-row-button");
  expect(buttons).toHaveLength(expectedButtons.length);
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const action = expectedButtons[i];
    expect(button).toHaveAttribute("data-element-id", action);
    if (action !== DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER) {
      await expectButtonInHeader({ button, action });
    }
  }
};

describe("DashboardHeaderButtonRow", () => {
  describe("when editing", () => {
    it("should show all edit-related buttons", async () => {
      setup({ isEditing: true, hasModelActionsEnabled: true });
      await expectButtonsToBeInHeader({
        expectedButtons: DASHBOARD_EDITING_ACTIONS,
      });
    });

    it("should not show `Add action element` when model actions are disabled", async () => {
      setup({ isEditing: true, hasModelActionsEnabled: false });
      await expectButtonsToBeInHeader({
        expectedButtons: DASHBOARD_EDITING_ACTIONS.filter(
          action => action !== DASHBOARD_ACTION.ADD_ACTION_ELEMENT,
        ),
      });
    });

    it("should not show view-related buttons", () => {
      setup({ isEditing: true });
      const buttons = screen.getAllByTestId("dashboard-header-row-button");

      const validActions = DASHBOARD_VIEW_ACTIONS.filter(
        action => action !== DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER,
      );

      for (const button of buttons) {
        const buttonKey = button.getAttribute("data-element-id");
        expect(validActions).not.toContain(buttonKey);
      }
    });
  });

  describe("when not editing", () => {
    it("should show view-related buttons", async () => {
      setup({
        isEditing: false,
        isNightMode: false,
        isAnalyticsDashboard: false,
        hasNightModeToggle: true,
        isAdmin: true,
      });
      await expectButtonsToBeInHeader({
        expectedButtons: [
          DASHBOARD_ACTION.EDIT_DASHBOARD,
          DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTION,
          DASHBOARD_ACTION.DASHBOARD_EMBED_ACTION,
          DASHBOARD_ACTION.REFRESH_WIDGET,
          DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER,
          DASHBOARD_ACTION.DASHBOARD_BOOKMARK,
          DASHBOARD_ACTION.DASHBOARD_INFO,
          DASHBOARD_ACTION.DASHBOARD_ACTION_MENU,
        ],
      });
    });

    it("should not show subscription button when user is not an admin", () => {
      setup({ isEditing: false, isAdmin: false });
      expectButtonsToBeInHeader({
        expectedButtons: [DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTION],
      });
    });

    it("should not show editing-related buttons", () => {
      setup({ isEditing: false });
      const buttons = screen.getAllByTestId("dashboard-header-row-button");

      const validActions = DASHBOARD_EDITING_ACTIONS.filter(
        action => action !== DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER,
      );

      for (const button of buttons) {
        const buttonKey = button.getAttribute("data-element-id");
        expect(validActions).not.toContain(buttonKey);
      }
    });

    it("should show fullscreen toggle when dashboard is public", () => {
      setup({ isEditing: false, isPublic: true });
      expectButtonsToBeInHeader({
        expectedButtons: [DASHBOARD_ACTION.FULLSCREEN_TOGGLE],
      });
    });

    it("should show night mode toggle when in fullscreen", () => {
      setup({
        isEditing: false,
        isFullscreen: true,
        hasNightModeToggle: true,
        isNightMode: true,
      });
      expectButtonsToBeInHeader({
        expectedButtons: [DASHBOARD_ACTION.NIGHT_MODE_TOGGLE],
      });
    });
  });

  describe("when viewing analytics dashboard", () => {
    it("should show analytics-specific buttons with correct icons and tooltips", () => {
      setup({ isEditing: false, isAnalyticsDashboard: true });
      expectButtonsToBeInHeader({
        expectedButtons: [
          DASHBOARD_ACTION.COPY_ANALYTICS_DASHBOARD,
          DASHBOARD_ACTION.FULLSCREEN_ANALYTICS_DASHBOARD,
        ],
      });
    });

    it("should not show regular dashboard action menu", () => {
      setup({ isEditing: false, isAnalyticsDashboard: true });
      expectButtonsToBeInHeader({
        expectedButtons: [DASHBOARD_ACTION.DASHBOARD_ACTION_MENU],
      });
    });
  });
});
