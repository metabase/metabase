import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import { CaveatText } from "./CaveatMessage.styled";

function CaveatMessage() {
  return (
    <CaveatText>
      {t`Recipients will see this data just as you see it, regardless of their permissions.`}
      &nbsp;
      <ExternalLink
        className="link"
        target="_blank"
        href={MetabaseSettings.docsUrl("dashboards/subscriptions")}
      >
        {t`Learn more`}
      </ExternalLink>
      .
    </CaveatText>
  );
}

export default CaveatMessage;
