import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

import { InfoText } from "./Description.styled";

export function Description() {
  const docsLink = useSelector(state =>
    getDocsUrl(state, { page: "actions/custom" }),
  );
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <InfoText>
      {jt`Configure your parameters' types and properties here. The values for these parameters can come from user input, or from a dashboard filter.`}
      {showMetabaseLinks && (
        <>
          {" "}
          <ExternalLink
            key="learn-more"
            href={docsLink}
          >{t`Learn more`}</ExternalLink>
        </>
      )}
    </InfoText>
  );
}
