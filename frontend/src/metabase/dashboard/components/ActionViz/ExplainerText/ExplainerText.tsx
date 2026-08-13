import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";

import {
  BrandLinkWithLeftMargin,
  ExplainerTextContainer,
} from "./ExplainerText.styled";

export function ExplainerText() {
  const { url, showMetabaseLinks } = useDocsUrl("dashboards/actions");
  return (
    <ExplainerTextContainer>
      {t`You can either ask users to enter values, or use the value of a dashboard filter.`}
      {showMetabaseLinks && (
        <BrandLinkWithLeftMargin href={url}>
          {t`Learn more.`}
        </BrandLinkWithLeftMargin>
      )}
    </ExplainerTextContainer>
  );
}
