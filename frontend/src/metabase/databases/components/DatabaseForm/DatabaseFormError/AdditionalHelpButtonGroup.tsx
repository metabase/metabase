import { Link } from "react-router";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { Button, Divider, Flex, Icon } from "metabase/ui";

import { TroubleshootingTip } from "./TroubleshootingTip";

export const AdditionalHelpButtonGroup = () => {
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const docsUrl = useSelector((state) => getDocsUrl(state, { page: "" }));

  return (
    <>
      {showMetabaseLinks && (
        <>
          <Divider variant="dashed" mb="lg" />
          <Button
            variant="subtle"
            leftSection={<Icon name="reference" />}
            className={CS.link}
            component={Link}
            to={docsUrl}
          >
            {t`Read the docs`}
          </Button>
        </>
      )}
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
