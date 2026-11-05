import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Flex, Icon } from "metabase/ui";

export function CustomMapFooter() {
  const isAdmin = useSelector(getUserIsAdmin);
  const docsUrl = useSelector((state) =>
    getDocsUrl(state, { page: "configuring-metabase/custom-maps" }),
  );
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  const content = (
    <Flex
      className={CS.borderTop}
      justify="space-between"
      c="text-primary"
      fw={700}
      px="xl"
      py="md"
    >
      {t`Custom map`}
      <Icon name="share" />
    </Flex>
  );

  if (isAdmin) {
    return (
      <Link to="/admin/settings/maps" aria-label={t`Custom map`}>
        {content}
      </Link>
    );
  }

  if (showMetabaseLinks) {
    return (
      <ExternalLink aria-label={t`Custom map`} href={docsUrl}>
        {content}
      </ExternalLink>
    );
  }

  return null;
}
