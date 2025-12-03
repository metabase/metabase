import { Link } from "react-router";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getDocsUrl } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Button, Divider, Icon } from "metabase/ui";

import { ContactSupportButtonSection } from "./ContactSupportButtonSection";

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
            target="_blank"
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
      <ContactSupportButtonSection />
    </>
  );
};
