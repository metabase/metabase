import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAlertsEndpoints,
  setupNotificationChannelsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useSelector } from "metabase/lib/redux";
import Question from "metabase-lib/v1/Question";
import type {
  Alert,
  Card,
  Dashboard,
  User,
  UserListResult,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DashboardNotificationsMenu } from "../DashboardNotificationsMenu";
import { QuestionNotificationsMenu } from "../QuestionNotificationsMenu";

// This is a fake sidebar that we can use to check if the correct redux state is getting updated
const FakeSidebar = () => {
  const sidebar = useSelector(state => state.dashboard.sidebar);

  if (sidebar.name) {
    return <div data-testid="fake-sidebar">Sidebar: {sidebar.name}</div>;
  }

  return null;
};

type SettingsProps = {
  isEmailSetup?: boolean;
  isSlackSetup?: boolean;
  isAdmin?: boolean;
  canManageSubscriptions?: boolean;
  isEnterprise?: boolean;
  card?: Card;
};

const setupState = ({
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
  card,
}: SettingsProps) => {
  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: isEnterprise,
    dashboard_subscription_filters: isEnterprise,
    audit_app: isEnterprise,
  });

  setupNotificationChannelsEndpoints({
    slack: { configured: isSlackSetup },
    email: { configured: isEmailSetup },
  } as any);

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "email-configured?": isEmailSetup,
    "slack-token-valid?": isSlackSetup,
  });

  const user = createMockUser({
    is_superuser: isAdmin,
  });

  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: {
      ...user,
      permissions: {
        can_access_subscription: canManageSubscriptions,
      },
      qb: {
        card,
      },
    } as User,
  });

  return state;
};

export function setupDashboardSharingMenu({
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
  dashboard: dashboardOverrides = {},
}: {
  dashboard?: Partial<Dashboard>;
} & SettingsProps) {
  const dashboard = createMockDashboard({
    name: "My Cool Dashboard",
    dashcards: [
      createMockDashboardCard({
        card: createMockCard({ display: "pie" }),
      }),
    ],
    ...dashboardOverrides,
  });

  const state = setupState({
    isEmailSetup,
    isSlackSetup,
    isAdmin,
    canManageSubscriptions,
    isEnterprise,
  });

  if (isEnterprise) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <div>
      <DashboardNotificationsMenu dashboard={dashboard} />
      <FakeSidebar />
    </div>,
    { storeInitialState: state },
  );
}

export function setupQuestionSharingMenu({
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
  question: questionOverrides = {},
  alerts = [],
}: {
  question?: Partial<Card>;
  alerts?: Alert[];
} & SettingsProps) {
  const card = createMockCard({
    name: "My Cool Question",
    display: "line",
    visualization_settings: createMockVisualizationSettings({
      "graph.show_goal": true,
      "graph.metrics": ["count"],
    }),
    ...questionOverrides,
  });

  const state = setupState({
    isEmailSetup,
    isSlackSetup,
    isAdmin,
    canManageSubscriptions,
    isEnterprise,
    card,
  });

  setupAlertsEndpoints(card, alerts);
  setupUsersEndpoints([state.currentUser] as UserListResult[]);

  if (isEnterprise) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <div>
      <QuestionNotificationsMenu question={new Question(card)} />
      <FakeSidebar />
    </div>,
    { storeInitialState: state },
  );
}

export const openMenu = () => {
  return userEvent.click(screen.getByTestId("notifications-menu-button"));
};
