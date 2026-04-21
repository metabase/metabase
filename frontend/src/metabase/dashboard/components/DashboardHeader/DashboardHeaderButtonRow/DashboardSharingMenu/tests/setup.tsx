import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { DashboardState } from "metabase/redux/store/dashboard";
import {
  createMockDashboardState,
  createMockState,
} from "metabase/redux/store/mocks";
import { useSelector } from "metabase/utils/redux";
import type { Dashboard, User } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { DashboardSharingMenu } from "../DashboardSharingMenu";

const FakeSidebar = () => {
  const sidebar = useSelector((state) => state.dashboard.sidebar);

  if (sidebar.name) {
    return <div data-testid="fake-sidebar">Sidebar: {sidebar.name}</div>;
  }

  return null;
};

type SettingsProps = {
  isEmbeddingEnabled?: boolean;
  isPublicSharingEnabled?: boolean;
  isEmailSetup?: boolean;
  isSlackSetup?: boolean;
  isAdmin?: boolean;
  canManageSubscriptions?: boolean;
  isEnterprise?: boolean;
  dashboardState?: Partial<DashboardState>;
};

const setupState = ({
  isEmbeddingEnabled = false,
  isPublicSharingEnabled = false,
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
  dashboardState,
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
    "enable-public-sharing": isPublicSharingEnabled,
    "enable-embedding-static": isEmbeddingEnabled,
    "email-configured?": isEmailSetup,
    "slack-token-valid?": isSlackSetup,
  });

  const user = createMockUser({
    is_superuser: isAdmin,
  });

  return createMockState({
    settings: mockSettings(settingValues),
    currentUser: {
      ...user,
      permissions: {
        can_access_subscription: canManageSubscriptions,
      },
    } as User,
    dashboard: createMockDashboardState(dashboardState),
  });
};

export function setupDashboardSharingMenu({
  isPublicSharingEnabled = false,
  isEmbeddingEnabled = false,
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
  hasPublicLink = false,
  dashboard: dashboardOverrides = {},
  dashboardState,
}: {
  dashboard?: Partial<Dashboard>;
  hasPublicLink?: boolean;
} & SettingsProps) {
  const dashboard = createMockDashboard({
    name: "My Cool Dashboard",
    public_uuid: hasPublicLink && isPublicSharingEnabled ? "1337bad801" : null,
    dashcards: [
      createMockDashboardCard({
        card: createMockCard({ display: "pie" }),
      }),
    ],
    ...dashboardOverrides,
  });

  const state = setupState({
    isPublicSharingEnabled,
    isEmbeddingEnabled,
    isEmailSetup,
    isSlackSetup,
    isAdmin,
    canManageSubscriptions,
    isEnterprise,
    dashboardState,
  });

  if (isEnterprise) {
    setupEnterpriseOnlyPlugin("audit_app");
    setupEnterpriseOnlyPlugin("application_permissions");
    setupEnterpriseOnlyPlugin("collections");
  }

  renderWithProviders(
    <div>
      <DashboardSharingMenu dashboard={dashboard} />
      <FakeSidebar />
    </div>,
    { storeInitialState: state },
  );
}

export const openMenu = () => {
  return userEvent.click(screen.getByTestId("sharing-menu-button"));
};
