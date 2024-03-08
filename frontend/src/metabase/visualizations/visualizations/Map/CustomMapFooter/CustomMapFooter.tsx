import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Icon } from "metabase/ui";

import { CustomMapContent } from "../Maps.styled";

export function CustomMapFooter() {
  const isAdmin = useSelector(getUserIsAdmin);
  const docsUrl = useSelector(state =>
    getDocsUrl(state, { page: "configuring-metabase/custom-maps" }),
  );
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  const content = (
    <CustomMapContent>
      {t`Custom map`}
      <Icon name="share" />
    </CustomMapContent>
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
