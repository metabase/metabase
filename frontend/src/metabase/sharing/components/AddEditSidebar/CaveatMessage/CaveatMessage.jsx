import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

import { CaveatText } from "./CaveatMessage.styled";

export function CaveatMessage() {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  return (
    <CaveatText>
      {t`Recipients will see this data just as you see it, regardless of their permissions.`}
      {showMetabaseLinks && (
        <>
          &nbsp;
          <ExternalLink
            className={CS.link}
            target="_blank"
            href={MetabaseSettings.docsUrl("dashboards/subscriptions")}
          >
            {t`Learn more.`}
          </ExternalLink>
        </>
      )}
    </CaveatText>
  );
}
