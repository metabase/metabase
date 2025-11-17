import type { DashboardActionValue } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";

export const concatActionIf =
  (action: DashboardActionValue, condition: boolean | undefined) =>
  (actions: DashboardActionValue[]) =>
    condition ? actions.concat(action) : actions;
