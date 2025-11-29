import type { ComponentType } from "react";

import type { DashboardContextReturned } from "metabase/dashboard/context";
import type { Collection, Dashboard } from "metabase-types/api";

import type { DASHBOARD_ACTION } from "./dashboard-action-keys";

export type DashboardActionKey = keyof typeof DASHBOARD_ACTION;

export type DashboardHeaderButtonRowProps = {
  canResetFilters: boolean;
  onResetFilters: () => void;
  collection?: Collection;
  isPublic?: boolean;
  isAnalyticsDashboard?: boolean;
};

export type HeaderButtonProps = {
  canResetFilters: boolean;
  onResetFilters: () => void;
  isEditing: boolean;
  canEdit: boolean;
  hasModelActionsEnabled: boolean;
  dashboard: Dashboard;
  canManageSubscriptions: boolean;
  formInput: any;
  isAdmin: boolean;
  openSettingsSidebar: () => void;
} & DashboardHeaderButtonRowProps;

export type DashboardActionButton = {
  component: ComponentType<HeaderButtonProps>;
  enabled: (
    props: HeaderButtonProps &
      Pick<
        DashboardContextReturned,
        | "downloadsEnabled"
        | "isFullscreen"
        | "onFullscreenChange"
        | "withSubscriptions"
      >,
  ) => boolean;
};
