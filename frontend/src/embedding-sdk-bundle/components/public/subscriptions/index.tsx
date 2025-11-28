import type { ButtonHTMLAttributes } from "react";

import type { ActionIconProps } from "metabase/ui";

export type DashboardSubscriptionsButtonProps = ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export const DASHBOARD_SUBSCRIPTIONS_SDK_PLUGIN = {
  DashboardSubscriptionsButton: (
    _props: DashboardSubscriptionsButtonProps,
  ): JSX.Element | null => null,
};
