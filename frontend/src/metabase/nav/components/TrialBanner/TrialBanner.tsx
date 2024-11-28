import dayjs from "dayjs";
import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import { Banner } from "metabase/components/Banner";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { getStoreUrl } from "metabase/selectors/settings";
import { Flex, Text } from "metabase/ui";

import { calculateDaysUntilTokenExpiry, shouldShowBanner } from "./utils";

export const TrialBanner = ({
  tokenExpiryTimestamp,
}: {
  tokenExpiryTimestamp: string;
}) => {
  const [lastDismissed, setLastDismissed] = useUserSetting(
    "trial-banner-dismissal-timestamp",
  );

  // Both `daysRemaining` and `showBanner` are supposed to share this same timestamp as an input.
  // We could've calculated the current timestamp from within each of these functions,
  // but that would've made them impure and harder to test.
  const currentTimestamp = dayjs().toISOString();

  const daysRemaining = calculateDaysUntilTokenExpiry({
    currentTime: currentTimestamp,
    tokenExpiry: tokenExpiryTimestamp,
  });

  const lastDay = daysRemaining === 0;

  const showBanner = useMemo(
    () =>
      shouldShowBanner({
        now: currentTimestamp,
        daysRemaining,
        lastDismissed,
      }),
    [currentTimestamp, daysRemaining, lastDismissed],
  );

  if (!showBanner) {
    return null;
  }

  const href = getStoreUrl("account/manage/plans");

  const handleBannerClose = () => {
    // We need a fresh timestamp here
    const now = dayjs().toISOString();
    setLastDismissed(now);
  };

  return (
    <Banner
      icon="warning_round_filled"
      bg="warning"
      body={
        <Flex align="center" gap="xs">
          {/* Text and ExternalLink originally have different line-heights that we need to marry. */}
          <Text lh="inherit">
            {lastDay
              ? t`Today is the last day of your trial.`
              : ngettext(
                  msgid`${daysRemaining} day left in your trial.`,
                  `${daysRemaining} days left in your trial.`,
                  daysRemaining,
                )}
          </Text>
          <ExternalLink className={CS.textBold} href={href}>
            {t`Manage your subscription.`}
          </ExternalLink>
        </Flex>
      }
      closable
      onClose={handleBannerClose}
      py="md"
    ></Banner>
  );
};
