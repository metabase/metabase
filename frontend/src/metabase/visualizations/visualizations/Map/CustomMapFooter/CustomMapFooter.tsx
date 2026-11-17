import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { getUserIsAdmin } from "metabase/current-user";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
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

  // the SDK has no router, so the admin link would send the host page to a missing route
  if (isEmbeddingSdk()) {
    return null;
  }

  const content = (
    <Flex component="span" align="center" gap="xs" fw="bold">
      {t`Custom map`}
      <Icon name="share" />
    </Flex>
  );

  if (isAdmin) {
    return (
      <Link
        to="/admin/settings/maps"
        variant="brand"
        aria-label={t`Custom map`}
      >
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
