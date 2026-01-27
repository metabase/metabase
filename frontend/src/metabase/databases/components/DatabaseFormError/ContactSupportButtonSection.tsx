import { Link } from "react-router";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
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
        <Flex direction="column" gap="md" align="flex-start">
          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only visible to admins */}
          {t`Reach out to Metabase engineers who can help with technical troubleshooting. Not your typical support agents.`}
          <Button
            component={Link}
            radius="md"
            size="md"
            target="_blank"
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
