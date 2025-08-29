import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Divider, Flex, Icon } from "metabase/ui";

import { TroubleshootingTip } from "./TroubleshootingTip";

export const AdditionalHelpButtonGroup = () => {
  const applicationName = useSelector(getApplicationName);

  return (
    <>
      <Divider variant="dashed" mb="lg" />
      <Button
        variant="subtle"
        leftSection={<Icon name="document" />}
        className={CS.link}
      >
        {t`Read the docs`}
      </Button>
      <Divider variant="dashed" />
      <Button
        variant="subtle"
        leftSection={<Icon name="mail" />}
        className={CS.link}
      >
        {t`Invite a teammate to help you`}
      </Button>
      <Divider variant="dashed" />
      <TroubleshootingTip
        body={
          <Flex direction="column" gap="md" align="flex-start">
            {t`Reach out to ${applicationName} engineers who can help with technical troubleshooting. Not your typical support agents.`}
            <Button variant="default" radius="md" size="md">
              {t`Contact Support`}
            </Button>
          </Flex>
        }
        noIcon
        title={t`Still stuck? We’re here to help`}
        pb="xl"
      />
    </>
  );
};
