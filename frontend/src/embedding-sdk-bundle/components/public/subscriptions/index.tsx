import type { ButtonHTMLAttributes } from "react";

import type { ActionIconProps } from "metabase/ui";

export type DashboardSubscriptionsButtonProps = ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

function getDefaultPluginDashboardSubscriptionsSdk() {
  return {
    DashboardSubscriptionsButton: (
      _props: DashboardSubscriptionsButtonProps,
    ): JSX.Element | null => null,
  };
}

export const PLUGIN_DASHBOARD_SUBSCRIPTIONS_SDK =
  getDefaultPluginDashboardSubscriptionsSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(
    PLUGIN_DASHBOARD_SUBSCRIPTIONS_SDK,
    getDefaultPluginDashboardSubscriptionsSdk(),
  );
}
