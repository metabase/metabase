import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getCrowdinUrl } from "metabase/selectors/settings";
import {
  getApplicationName,
  getIsWhiteLabeling,
} from "metabase/selectors/whitelabel";

export function getLocalizationNoticeText(applicationName: string) {
  return t`Some translations are created by the ${applicationName} community, and might not be perfect.`;
}

export function CommunityLocalizationNotice({
  isAdminView = false,
}: {
  isAdminView: boolean;
}) {
  const applicationName = useSelector(getApplicationName);
  const isWhiteLabeling = useSelector(getIsWhiteLabeling);
  const translatedLink = (
    <ExternalLink
      href={getCrowdinUrl()}
      key="crowdin-link"
    >{t`contribute to translations here`}</ExternalLink>
  );

  const showLink = !isWhiteLabeling || isAdminView;

  return (
    <span>
      <span>{getLocalizationNoticeText(applicationName)}</span>
      {showLink && <span> {jt`You can ${translatedLink}`}.</span>}
    </span>
  );
}
