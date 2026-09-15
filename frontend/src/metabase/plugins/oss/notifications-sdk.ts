import type { ButtonHTMLAttributes } from "react";

import type { ActionIconProps } from "metabase/ui";

import { definePluginSlot } from "../slot";

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

export const PLUGIN_NOTIFICATIONS_SDK = definePluginSlot(
  getDefaultPluginNotificationsSdk,
);
