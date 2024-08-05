import type { ComponentType } from "react";

import type { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/action-buttons";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  DashboardNightModeControls,
} from "metabase/dashboard/types";
import type { Collection, Dashboard } from "metabase-types/api";

export type DashboardActionKey = keyof typeof DASHBOARD_ACTION;

export type DashboardHeaderButtonRowProps = {
  canResetFilters: boolean;
  onResetFilters: () => void;
  collection?: Collection;
  isPublic?: boolean;
  isAnalyticsDashboard?: boolean;
} & DashboardRefreshPeriodControls &
  DashboardFullscreenControls &
  DashboardNightModeControls;

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
} & DashboardHeaderButtonRowProps;

export type DashboardActionButton = {
  component: ComponentType<HeaderButtonProps>;
  enabled: (props: HeaderButtonProps) => boolean;
};
