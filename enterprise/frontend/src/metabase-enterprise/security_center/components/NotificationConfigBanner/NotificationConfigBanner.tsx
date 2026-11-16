import { t } from "ttag";

import { useGetChannelInfoQuery } from "metabase/api";
import { getPlan, useSetting } from "metabase/settings";

import { WarningBanner } from "../WarningBanner/WarningBanner";

function useShouldShow(): boolean {
  const tokenFeatures = useSetting("token-features");
  const plan = getPlan(tokenFeatures);
  const { data: channelInfo, isLoading: isChannelInfoLoading } =
    useGetChannelInfoQuery();

  if (plan !== "pro-self-hosted") {
    return false;
  }

  if (isChannelInfoLoading) {
    return false;
  }

  const channels = channelInfo?.channels;
  const hasEmail = !!channels?.email?.configured;
  const hasSlack = !!channels?.slack?.configured;

  const isConfigured = hasEmail || hasSlack;
  return !isConfigured;
}

export function NotificationConfigBanner() {
  const shouldShow = useShouldShow();

  if (!shouldShow) {
    return null;
  }

  return (
    <WarningBanner
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- only visible to admins on self-hosted instances
      message={t`Configure notifications to be alerted about security vulnerabilities in your Metabase instance`}
      data-testid="notification-config-banner"
    />
  );
}
