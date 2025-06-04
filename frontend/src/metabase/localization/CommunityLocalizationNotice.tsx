import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getCrowdinUrl } from "metabase/selectors/settings";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";

export function getLocalizationNoticeText(applicationName: string) {
  return t`Some translations are created by the ${applicationName} community, and might not be perfect.`;
}

export interface CommunityLocalizationNoticeProps {
  isAdminView: boolean;
}

export function CommunityLocalizationNotice({
  isAdminView = false,
}: CommunityLocalizationNoticeProps) {
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const translatedLink = (
    <ExternalLink
      href={getCrowdinUrl()}
      key="crowdin-link"
    >{t`contribute to translations here`}</ExternalLink>
  );

  const showLink = showMetabaseLinks || isAdminView;
  // eslint-disable-next-line no-literal-metabase-strings -- For admin screens we want to original app name
  const displayName = isAdminView ? "Metabase" : applicationName;

  return (
    <span>
      <span>{getLocalizationNoticeText(displayName)}</span>
      {showLink && <span> {jt`You can ${translatedLink}`}.</span>}
    </span>
  );
}
