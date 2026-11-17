import { skipToken } from "@reduxjs/toolkit/query/react";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useGetChannelInfoQuery } from "metabase/api";
import { getUserIsAdmin } from "metabase/current-user";
import { NavbarPromoCard } from "metabase/nav/components/NavbarPromoCard";
import { useSelector } from "metabase/redux";
import { Icon } from "metabase/ui";

const DISMISSED_KEY = "security-center-promo-dismissed";

function useDismissed() {
  const [dismissed, setDismissedState] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === "true",
  );

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissedState(true);
  }, []);

  return { dismissed, dismiss };
}

export function SecurityCenterPromoCard() {
  const isAdmin = useSelector(getUserIsAdmin);
  const { data: channelInfo, isLoading: isChannelInfoLoading } =
    useGetChannelInfoQuery(isAdmin ? undefined : skipToken);
  const { dismissed, dismiss } = useDismissed();

  // The promo links to /admin/security-center, so only admins should see it.
  if (!isAdmin) {
    return null;
  }

  if (isChannelInfoLoading) {
    return null;
  }

  const hasEmail = !!channelInfo?.channels?.email?.configured;
  const hasSlack = !!channelInfo?.channels?.slack?.configured;

  if (hasEmail || hasSlack) {
    return null;
  }

  if (dismissed) {
    return null;
  }

  return (
    <NavbarPromoCard
      icon={
        <Icon
          name="shield_stroke"
          height={24}
          width={24}
          style={{ stroke: "var(--mb-color-core-brand)", fill: "transparent" }}
        />
      }
      title={t`Stay safe with security alerts`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This only shows for admins
      body={t`Metabase's Security Center can send you alerts via email or Slack immediately about security vulnerabilities.`}
      linkText={t`Set up security alerts`}
      linkTo="/admin/security-center?open=notifications"
      onDismiss={dismiss}
    />
  );
}
