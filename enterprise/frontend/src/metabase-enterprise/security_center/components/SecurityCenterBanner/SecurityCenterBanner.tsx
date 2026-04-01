import { useCallback, useState } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";

import { useListSecurityAdvisoriesQuery } from "metabase/api";
import { Banner } from "metabase/common/components/Banner";
import { useSetting } from "metabase/common/hooks";
import {
  useHasEmailSetup,
  useHasSlackSetup,
} from "metabase/common/hooks/use-notification-channels/use-notification-channels";
import { getPlan } from "metabase/common/utils/plan";
import { Anchor, Flex, Text } from "metabase/ui";

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
  const hasEmail = useHasEmailSetup();
  const hasSlack = useHasSlackSetup();
  const { data: advisoriesResponse } = useListSecurityAdvisoriesQuery();
  const { dismissed, dismiss } = useDismissed();

  if (plan !== "pro-self-hosted") {
    return null;
  }

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
      to="/admin/settings/security-center"
      c="inherit"
      td="underline"
    >
      {t`Set up notifications`}
    </Anchor>
  );

  if (hasActiveAdvisory) {
    return (
      <Banner
        icon="warning_round_filled"
        bg="error"
        body={
          <Flex align="center" gap="xs">
            <Text lh="inherit">
              {jt`Active security advisories require attention, but no notification channels are configured. ${settingsLink}`}
            </Text>
          </Flex>
        }
        py="md"
      />
    );
  }

  return (
    <Banner
      icon="warning_round_filled"
      bg="warning"
      body={
        <Flex align="center" gap="xs">
          <Text lh="inherit">
            {jt`No notification channels are configured for security alerts. ${settingsLink}`}
          </Text>
        </Flex>
      }
      closable
      onClose={dismiss}
      py="md"
    />
  );
}
