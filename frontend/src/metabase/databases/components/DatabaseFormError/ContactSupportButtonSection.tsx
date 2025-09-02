import { Link } from "react-router";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Flex } from "metabase/ui";

import { TroubleshootingTip } from "./TroubleshootingTip";

export const ContactSupportButtonSection = () => {
  const isPaidPlan = useSelector(getIsPaidPlan);
  const applicationName = useSelector(getApplicationName);
  const { tag } = useSetting("version");

  const helpUrl = isPaidPlan
    ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}`
    : `https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}`;

  return (
    <TroubleshootingTip
      body={
        <Flex direction="column" gap="md" align="flex-start">
          {t`Reach out to ${applicationName} engineers who can help with technical troubleshooting. Not your typical support agents.`}
          <Button
            component={Link}
            radius="md"
            size="md"
            to={helpUrl}
            variant="default"
          >
            {t`Contact Support`}
          </Button>
        </Flex>
      }
      noIcon
      pb="xl"
      title={t`Still stuck? We’re here to help`}
    />
  );
};
