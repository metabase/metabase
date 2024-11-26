import dayjs from "dayjs";
import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import { Banner } from "metabase/components/Banner";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { getStoreUrl } from "metabase/selectors/settings";
import { Flex, Text } from "metabase/ui";
import type { TokenStatus } from "metabase-types/api";
export const TrialBanner = ({ tokenStatus }: { tokenStatus: TokenStatus }) => {
  const [lastDismissed, setLastDismissed] = useUserSetting(
    "trial-banner-dismissal-timestamp",
  );

  const now = dayjs();
  const tokenExpiryDate = dayjs(tokenStatus["valid-thru"]);

  const daysRemaining = tokenExpiryDate.diff(now, "day");
  const lastDay = daysRemaining === 0;

  const shouldShowBanner = useMemo(() => {
    // No banner if the trial already expired
    if (daysRemaining < 0) {
      return false;
    }

    // In the last 3 days, check dismissal logic with stricter reappearance
    if (daysRemaining <= 3) {
      const bannerReappearanceThreshold = tokenExpiryDate
        .subtract(daysRemaining, "day")
        .unix();

      // Banner shows if it hasn't been dismissed after the reappearance point
      return !lastDismissed || lastDismissed < bannerReappearanceThreshold;
    }

    // For the first 11 days, check if it was ever dismissed
    return !lastDismissed;
  }, [daysRemaining, lastDismissed, tokenExpiryDate]);

  const href = getStoreUrl("account/manage/plans");

  const handleBannerClose = () => {
    setLastDismissed(dayjs().unix());
  };

  if (!shouldShowBanner) {
    return null;
  }

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
