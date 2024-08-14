import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

import {
  ExplainerTextContainer,
  BrandLinkWithLeftMargin,
} from "./ExplainerText.styled";

export function ExplainerText() {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  return (
    <ExplainerTextContainer>
      {t`You can either ask users to enter values, or use the value of a dashboard filter.`}
      {showMetabaseLinks && (
        <BrandLinkWithLeftMargin
          href={MetabaseSettings.docsUrl("dashboards/actions")}
        >
          {t`Learn more.`}
        </BrandLinkWithLeftMargin>
      )}
    </ExplainerTextContainer>
  );
}
