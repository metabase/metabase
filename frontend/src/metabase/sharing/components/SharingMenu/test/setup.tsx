import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useSelector } from "metabase/lib/redux";
import Question from "metabase-lib/v1/Question";
import type { Card, Dashboard, User } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DashboardSharingMenu } from "../DashboardSharingMenu";
import { QuestionSharingMenu } from "../QuestionSharingMenu";

// This is a fake sidebar that we can use to check if the correct redux state is getting updated
const FakeSidebar = () => {
  const sidebar = useSelector(state => state.dashboard.sidebar);

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
};

const setupState = ({
  isEmbeddingEnabled = false,
  isPublicSharingEnabled = false,
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
}: SettingsProps) => {
  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: isEnterprise,
    dashboard_subscription_filters: isEnterprise,
    audit_app: isEnterprise,
  });

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "enable-public-sharing": isPublicSharingEnabled,
    "enable-embedding": isEmbeddingEnabled,
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
    } as User,
  });

  return state;
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
}: {
  dashboard?: Partial<Dashboard>;
  hasPublicLink?: boolean;
} & SettingsProps) {
  const dashboard = createMockDashboard({
    name: "My Cool Dashboard",
    public_uuid: hasPublicLink && isPublicSharingEnabled ? "1337bad801" : null,
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
  });

  if (isEnterprise) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <div>
      <DashboardSharingMenu dashboard={dashboard} />
      <FakeSidebar />
    </div>,
    { storeInitialState: state },
  );
}

export function setupQuestionSharingMenu({
  isPublicSharingEnabled = false,
  isEmbeddingEnabled = false,
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
  hasPublicLink = false,
  question: questionOverrides = {},
}: {
  question?: Partial<Card>;
  hasPublicLink?: boolean;
} & SettingsProps) {
  const state = setupState({
    isPublicSharingEnabled,
    isEmbeddingEnabled,
    isEmailSetup,
    isSlackSetup,
    isAdmin,
    canManageSubscriptions,
    isEnterprise,
  });

  const card = createMockCard({
    name: "My Cool Question",
    public_uuid: hasPublicLink && isPublicSharingEnabled ? "1337bad801" : null,
    ...questionOverrides,
  });

  if (isEnterprise) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <div>
      <QuestionSharingMenu question={new Question(card)} />
      <FakeSidebar />
    </div>,
    { storeInitialState: state },
  );
}

export const openMenu = () => {
  return userEvent.click(screen.getByTestId("sharing-menu-button"));
};
