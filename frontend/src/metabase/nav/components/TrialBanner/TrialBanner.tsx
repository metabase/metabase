import { msgid, ngettext, t } from "ttag";

import { Banner } from "metabase/common/components/Banner";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Flex, Text } from "metabase/ui";

export const TrialBanner = ({
  daysRemaining,
  onClose,
}: {
  daysRemaining: number;
  onClose: () => void;
}) => {
  const lastDay = daysRemaining === 0;
  const href = useStoreUrl("account/manage/plans");

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
      onClose={onClose}
      py="md"
    ></Banner>
  );
};
