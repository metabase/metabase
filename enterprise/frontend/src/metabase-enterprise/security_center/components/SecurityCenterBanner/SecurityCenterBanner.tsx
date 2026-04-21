import { useCallback, useState } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";

import {
  useGetChannelInfoQuery,
  useListSecurityAdvisoriesQuery,
} from "metabase/api";
import { Banner } from "metabase/common/components/Banner";
import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { Anchor, Text } from "metabase/ui";

import { isAffected } from "../../utils";

const DISMISSED_KEY = "security-center-banner-dismissed";

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

export function SecurityCenterBanner() {
  const tokenFeatures = useSetting("token-features");
  const plan = getPlan(tokenFeatures);
  const { data: channelInfo, isLoading: isChannelInfoLoading } =
    useGetChannelInfoQuery();
  const { data: advisoriesResponse, isLoading: isAdvisoriesLoading } =
    useListSecurityAdvisoriesQuery();
  const { dismissed, dismiss } = useDismissed();

  if (plan !== "pro-self-hosted") {
    return null;
  }

  if (isChannelInfoLoading || isAdvisoriesLoading) {
    return null;
  }

  const hasEmail = !!channelInfo?.channels?.email?.configured;
  const hasSlack = !!channelInfo?.channels?.slack?.configured;

  if (hasEmail || hasSlack) {
    return null;
  }

  const advisories = advisoriesResponse?.advisories ?? [];
  const hasActiveAdvisory = advisories.some(isAffected);

  if (dismissed && !hasActiveAdvisory) {
    return null;
  }

  const settingsLink = (
    <Anchor
      key="link"
      component={Link}
      fw="bold"
      to="/admin/security-center"
      c="inherit"
      td="underline"
    >
      {t`Set up notifications`}
    </Anchor>
  );

  if (hasActiveAdvisory) {
    return (
      <Banner
        contentGroupProps={{ wrap: "nowrap" }}
        icon="warning_round_filled"
        bg="error"
        body={
          <Text lh="inherit">
            {jt`Active security advisories require attention, but no notification channels are configured. ${settingsLink}`}
          </Text>
        }
        py="md"
      />
    );
  }

  return (
    <Banner
      contentGroupProps={{ wrap: "nowrap" }}
      icon="warning_round_filled"
      bg="warning"
      body={
        <Text lh="inherit" c="text-primary">
          {jt`No notification channels are configured for security alerts. ${settingsLink}`}
        </Text>
      }
      closable
      onClose={dismiss}
      py="md"
    />
  );
}
