import { jt, t } from "ttag";

import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getCrowdinUrl } from "metabase/selectors/settings";
import {
  getApplicationName,
  getIsWhiteLabeling,
} from "metabase/selectors/whitelabel";

export function CommunityLocalizationNotice({
  isAdminView = false,
}: {
  isAdminView: boolean;
}) {
  const applicationName = useSelector(getApplicationName);
  const isWhiteLabeling = useSelector(getIsWhiteLabeling);
  const translatedLink = (
    <Link
      to={getCrowdinUrl()}
      variant="brand"
      target="_blank"
    >{t`contribute to translations here`}</Link>
  );

  const showLink = !isWhiteLabeling || isAdminView;

  return (
    <>
      {t`Some translations are created by the ${applicationName} community, and might not be perfect.`}
      {showLink && <> {jt`You can ${translatedLink}`}.</>}
    </>
  );
}
