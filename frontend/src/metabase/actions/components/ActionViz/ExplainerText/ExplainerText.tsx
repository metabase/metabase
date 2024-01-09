import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import {
  ExplainerTextContainer,
  BrandLinkWithLeftMargin,
} from "./ExplainerText.styled";

export function ExplainerText() {
  return (
    <ExplainerTextContainer>
      {t`You can either ask users to enter values, or use the value of a dashboard filter.`}
      <BrandLinkWithLeftMargin
        href={MetabaseSettings.docsUrl("dashboards/actions")}
      >
        {t`Learn more.`}
      </BrandLinkWithLeftMargin>
    </ExplainerTextContainer>
  );
}
