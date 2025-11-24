import type { DashboardActionValue } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";

export const concatActionIf =
  (condition: boolean | undefined, action: DashboardActionValue) =>
  (actions: DashboardActionValue[]) =>
    condition ? actions.concat(action) : actions;
