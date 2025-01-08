import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { DashboardActionMenu } from "metabase/dashboard/components/DashboardHeader/buttons";
import type { Card, Dashboard, User } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

type SettingsProps = {
  isEmbeddingEnabled?: boolean;
  isPublicSharingEnabled?: boolean;
  isAdmin?: boolean;
  isEnterprise?: boolean;
  card?: Card;
};

const setupState = ({
  isEmbeddingEnabled = false,
  isPublicSharingEnabled = false,
  isAdmin = false,
  isEnterprise = false,
  card,
}: SettingsProps) => {
  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: isEnterprise,
    dashboard_subscription_filters: isEnterprise,
    audit_app: isEnterprise,
  });

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "enable-public-sharing": isPublicSharingEnabled,
    "enable-embedding-static": isEmbeddingEnabled,
  });

  const user = createMockUser({
    is_superuser: isAdmin,
  });

  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: {
      ...user,
      qb: {
        card,
      },
    } as User,
  });

  return state;
};

export function setup({
  isEmbeddingEnabled,
  isPublicSharingEnabled,
  isAdmin = false,
  isEnterprise = false,
  hasPublicLink = false,
  dashboard: dashboardOverrides = {},
}: {
  isEmbeddingEnabled?: boolean;
  isPublicSharingEnabled?: boolean;
  isAdmin?: boolean;
  isEnterprise?: boolean;
  hasPublicLink?: boolean;
  dashboard?: Partial<Dashboard>;
}) {
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
    isAdmin,
    isEnterprise,
  });

  if (isEnterprise) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <Route
      path="/"
      component={props => (
        <DashboardActionMenu
          canResetFilters={true}
          onResetFilters={jest.fn()}
          onFullscreenChange={jest.fn()}
          isFullscreen={false}
          dashboard={dashboard}
          canEdit={true}
          openSettingsSidebar={jest.fn()}
          {...props}
        />
      )}
    />,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );
}

export const openMenu = async () => {
  await userEvent.click(getIcon("ellipsis"));
  expect(await screen.findByRole("menu")).toBeInTheDocument();
};
