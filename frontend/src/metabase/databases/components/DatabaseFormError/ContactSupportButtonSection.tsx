import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useSelector } from "metabase/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { useSetting } from "metabase/settings";
import { Button, Flex } from "metabase/ui";

import { TroubleshootingTip } from "./TroubleshootingTip";

export const ContactSupportButtonSection = () => {
  const isPaidPlan = useSelector(getIsPaidPlan);
  const { tag } = useSetting("version");

  const helpUrl = isPaidPlan
    ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}`
    : `https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}`;

  return (
    <TroubleshootingTip
      body={
        <Flex direction="column" gap="lg" align="flex-start">
          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only visible to admins */}
          {t`Reach out to Metabase engineers who can help with technical troubleshooting. Not your typical support agents.`}
          <Button component={Link} radius="sm" target="_blank" to={helpUrl}>
            {t`Contact Support`}
          </Button>
        </Flex>
      }
      noIcon
      pb="xxl"
      title={t`Still stuck? We’re here to help`}
    />
  );
};
