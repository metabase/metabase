import { jt, t } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import { InfoText } from "./Description.styled";

export function Description() {
  const docsLink = (
    <ExternalLink
      key="learn-more"
      href={MetabaseSettings.docsUrl("actions/custom")}
    >{t`Learn more`}</ExternalLink>
  );
  return (
    <InfoText>
      {jt`Configure your parameters' types and properties here. The values for these parameters can come from user input, or from a dashboard filter. ${docsLink}`}
    </InfoText>
  );
}
