import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupBookmarksEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { DashboardActionKey } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import { DASHBOARD_APP_ACTIONS } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
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
import { DASHBOARD_EDITING_ACTIONS, DASHBOARD_VIEW_ACTIONS } from "./constants";
import { DASHBOARD_ACTION } from "./dashboard-action-keys";

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
    tooltip: "Add a link or iframe",
  },
  [DASHBOARD_ACTION.ADD_SECTION]: {
    icon: "section",
    tooltip: "Add section",
  },
  [DASHBOARD_ACTION.ADD_FILTER_PARAMETER]: {
    icon: "filter",
    tooltip: "Add a filter or parameter",
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
  [DASHBOARD_ACTION.DASHBOARD_SHARING]: {
    icon: "share",
    tooltip: "Sharing",
  },
  [DASHBOARD_ACTION.REFRESH_WIDGET]: {
    icon: "clock",
    tooltip: "Auto-refresh",
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
    tooltip: null,
  },
  DOWNLOAD_PDF: {
    icon: "download",
    tooltip: "Download as PDF",
  },
  DASHBOARD_SUBSCRIPTIONS: {},
  REFRESH_INDICATOR: {},
};

const setup = ({
  isEditing,
  hasModelActionsEnabled,
  isFullscreen = false,
  isPublic,
  isAnalyticsDashboard,
  isAdmin = false,
}: Partial<{
  isEditing: boolean;
  hasModelActionsEnabled: boolean;
  isFullscreen: boolean;
  isPublic: boolean;
  isAnalyticsDashboard: boolean;
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
    dashcards: MOCK_DASHBOARD.dashcards.map((dc) => dc.id),
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
        <MockDashboardContext
          refreshPeriod={null}
          onRefreshPeriodChange={jest.fn()}
          setRefreshElapsedHook={jest.fn()}
          isFullscreen={isFullscreen}
          onFullscreenChange={jest.fn()}
          downloadsEnabled={{ pdf: false }}
          dashboardActions={DASHBOARD_APP_ACTIONS}
        >
          <DashboardHeaderButtonRow
            canResetFilters
            onResetFilters={jest.fn()}
            isPublic={isPublic}
            isAnalyticsDashboard={isAnalyticsDashboard}
          />
        </MockDashboardContext>
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
  if (tooltip) {
    expect(await screen.findByText(tooltip)).toBeInTheDocument();
  }
};

const expectButtonsToStrictMatchHeader = async ({
  expectedButtons,
  checkLength,
}: {
  expectedButtons: DashboardActionKey[];
  checkLength?: boolean;
}) => {
  const buttons = screen.getAllByTestId("dashboard-header-row-button");

  if (checkLength) {
    expect(buttons).toHaveLength(expectedButtons.length);
  }

  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const action = expectedButtons[i];
    expect(button).toHaveAttribute("data-element-id", action);
    if (action !== DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER) {
      await expectButtonInHeader({ button, action });
    }
  }
};

const expectButtonsToExistInHeader = async ({
  expectedButtons,
}: {
  expectedButtons: DashboardActionKey[];
}) => {
  for (const action of expectedButtons) {
    const button = screen.getByLabelText(
      `${DASHBOARD_EXPECTED_DATA_MAP[action].icon} icon`,
    );

    expect(button).toBeInTheDocument();

    await userEvent.hover(button);

    const { tooltip } = DASHBOARD_EXPECTED_DATA_MAP[action];
    if (tooltip) {
      expect(await screen.findByText(tooltip)).toBeInTheDocument();
    }
  }
};

describe("DashboardHeaderButtonRow", () => {
  describe("when editing", () => {
    it("should show all edit-related buttons", async () => {
      setup({ isEditing: true, hasModelActionsEnabled: true });
      await expectButtonsToStrictMatchHeader({
        expectedButtons: DASHBOARD_EDITING_ACTIONS,
        checkLength: true,
      });
    });

    it("should not show `Add action element` when model actions are disabled", async () => {
      setup({ isEditing: true, hasModelActionsEnabled: false });
      await expectButtonsToStrictMatchHeader({
        expectedButtons: DASHBOARD_EDITING_ACTIONS.filter(
          (action) => action !== DASHBOARD_ACTION.ADD_ACTION_ELEMENT,
        ),
        checkLength: true,
      });
    });

    it("should not show view-related buttons", () => {
      setup({ isEditing: true });
      const buttons = screen.getAllByTestId("dashboard-header-row-button");

      const validActions = DASHBOARD_VIEW_ACTIONS.filter(
        (action) => action !== DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER,
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
        isAnalyticsDashboard: false,
        isAdmin: true,
      });
      await expectButtonsToStrictMatchHeader({
        expectedButtons: [
          DASHBOARD_ACTION.EDIT_DASHBOARD,
          DASHBOARD_ACTION.DASHBOARD_SHARING,
          DASHBOARD_ACTION.REFRESH_WIDGET,
          DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER,
          DASHBOARD_ACTION.DASHBOARD_BOOKMARK,
          DASHBOARD_ACTION.DASHBOARD_INFO,
          DASHBOARD_ACTION.DASHBOARD_ACTION_MENU,
        ],
        checkLength: true,
      });
    });

    it("should show sharing button", () => {
      setup({ isEditing: false });
      expect(screen.getByTestId("sharing-menu-button")).toBeInTheDocument();
    });

    it("should not show editing-related buttons", () => {
      setup({ isEditing: false });
      const buttons = screen.getAllByTestId("dashboard-header-row-button");

      const validActions = DASHBOARD_EDITING_ACTIONS.filter(
        (action) => action !== DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER,
      );

      for (const button of buttons) {
        const buttonKey = button.getAttribute("data-element-id");
        expect(validActions).not.toContain(buttonKey);
      }
    });

    it("should show fullscreen toggle when dashboard is public", async () => {
      setup({ isEditing: false, isPublic: true });
      await expectButtonsToExistInHeader({
        expectedButtons: [DASHBOARD_ACTION.FULLSCREEN_TOGGLE],
      });
    });
  });

  describe("when viewing analytics dashboard", () => {
    it("should show analytics-specific buttons with correct icons and tooltips", async () => {
      setup({ isEditing: false, isAnalyticsDashboard: true });
      await expectButtonsToExistInHeader({
        expectedButtons: [
          DASHBOARD_ACTION.COPY_ANALYTICS_DASHBOARD,
          DASHBOARD_ACTION.FULLSCREEN_ANALYTICS_DASHBOARD,
        ],
      });
    });

    it("should not show regular dashboard action menu", () => {
      setup({ isEditing: false, isAnalyticsDashboard: true });

      expect(
        screen.queryByLabelText(
          `${DASHBOARD_EXPECTED_DATA_MAP[DASHBOARD_ACTION.DASHBOARD_ACTION_MENU].icon} icon`,
        ),
      ).not.toBeInTheDocument();
    });
  });
});
