import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";

import { CaveatText } from "./CaveatMessage.styled";

export function CaveatMessage() {
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    "dashboards/subscriptions",
  );

  return (
    <CaveatText>
      {t`Recipients will see this data just as you see it, regardless of their permissions.`}
      {showMetabaseLinks && (
        <>
          &nbsp;
          <ExternalLink className={CS.link} target="_blank" href={docsUrl}>
            {t`Learn more.`}
          </ExternalLink>
        </>
      )}
    </CaveatText>
  );
}
