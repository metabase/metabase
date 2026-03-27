import type { ButtonHTMLAttributes } from "react";

import type { ActionIconProps } from "metabase/ui";

export type DashboardSubscriptionsButtonProps = ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export type QuestionAlertsButtonProps = ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

function getDefaultPluginNotificationsSdk() {
  return {
    DashboardSubscriptionsButton: (
      _props: DashboardSubscriptionsButtonProps,
    ): JSX.Element | null => null,
    QuestionAlertsButton: (
      _props: QuestionAlertsButtonProps,
    ): JSX.Element | null => null,
  };
}

export const PLUGIN_NOTIFICATIONS_SDK = getDefaultPluginNotificationsSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_NOTIFICATIONS_SDK, getDefaultPluginNotificationsSdk());
}
