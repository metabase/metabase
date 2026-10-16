import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Button, Divider, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./AdditionalHelpButtonGroup.module.css";
import { ContactSupportButtonSection } from "./ContactSupportButtonSection";

export const AdditionalHelpButtonGroup = () => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const docsUrl = useSelector((state) => getDocsUrl(state, { page: "" }));
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <>
      <Divider variant="dashed" />
      {showMetabaseLinks && (
        <Box className={S.row} px="lg" py="md">
          <Button
            component={Link}
            leftSection={<Icon name="reference" />}
            target="_blank"
            to={docsUrl}
            variant="transparent"
            size="compact-md"
          >
            {t`Read the docs`}
          </Button>
        </Box>
      )}
      {isAdmin && (
        <Box className={S.row} px="lg" py="md">
          <Button
            component={Link}
            leftSection={<Icon name="mail" />}
            to={Urls.newUser()}
            variant="transparent"
            size="compact-md"
          >
            {t`Invite a teammate to help you`}
          </Button>
        </Box>
      )}
      <ContactSupportButtonSection />
    </>
  );
};
