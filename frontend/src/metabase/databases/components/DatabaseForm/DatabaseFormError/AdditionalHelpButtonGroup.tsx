import { Link } from "react-router";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getDocsUrl, getIsPaidPlan } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { Button, Divider, Flex, Icon } from "metabase/ui";

import { TroubleshootingTip } from "./TroubleshootingTip";

export const AdditionalHelpButtonGroup = () => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const docsUrl = useSelector((state) => getDocsUrl(state, { page: "" }));
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <>
      {showMetabaseLinks && (
        <>
          <Divider variant="dashed" mb="lg" />
          <Button
            className={CS.link}
            component={Link}
            leftSection={<Icon name="reference" />}
            to={docsUrl}
            variant="subtle"
          >
            {t`Read the docs`}
          </Button>
        </>
      )}
      {isAdmin && (
        <>
          <Divider variant="dashed" />
          <Button
            className={CS.link}
            component={Link}
            leftSection={<Icon name="mail" />}
            to={Urls.newUser()}
            variant="subtle"
          >
            {t`Invite a teammate to help you`}
          </Button>
        </>
      )}
      <Divider variant="dashed" />
      <ContactSupportSection />
    </>
  );
};

const ContactSupportSection = () => {
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
