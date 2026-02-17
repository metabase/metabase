import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { CROWDIN_URL } from "metabase/selectors/settings";
import {
  getIsWhiteLabeling,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";

export function getLocalizationNoticeText({
  mentionMetabase,
}: {
  mentionMetabase: boolean;
}) {
  return mentionMetabase
    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- For admin screens we want to original app name
      t`Some translations are created by the Metabase community, and might not be perfect.`
    : t`Some translations are created by the community, and might not be perfect.`;
}

export interface CommunityLocalizationNoticeProps {
  isAdminView: boolean;
}

export function CommunityLocalizationNotice({
  isAdminView = false,
}: CommunityLocalizationNoticeProps) {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const isWhiteLabeling = useSelector(getIsWhiteLabeling);
  const translatedLink = (
    <ExternalLink
      href={CROWDIN_URL}
      key="crowdin-link"
    >{t`contribute to translations here`}</ExternalLink>
  );

  const showLink = showMetabaseLinks || isAdminView;

  return (
    <span>
      <span>
        {getLocalizationNoticeText({
          mentionMetabase: isAdminView || !isWhiteLabeling,
        })}
      </span>
      {showLink && <span> {jt`You can ${translatedLink}`}.</span>}
    </span>
  );
}
