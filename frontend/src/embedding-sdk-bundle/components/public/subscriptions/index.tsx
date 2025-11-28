import type { ButtonHTMLAttributes } from "react";

import type { ActionIconProps } from "metabase/ui";

export type DashboardSubscriptionsButtonProps = ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export const PLUGIN_DASHBOARD_SUBSCRIPTIONS_SDK = {
  DashboardSubscriptionsButton: (
    _props: DashboardSubscriptionsButtonProps,
  ): JSX.Element | null => null,
};
