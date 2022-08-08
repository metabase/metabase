import React from "react";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";

import Text from "metabase/components/type/Text";
import ExternalLink from "metabase/core/components/ExternalLink";

function CaveatMessage() {
  return (
    <Text className="mx4 my2 p2 bg-light text-dark rounded">
      <span className="text-bold">{t`Note`}:&nbsp;</span>
      {t`charts in your subscription won't look the same as in your dashboard.`}
      &nbsp;
      <ExternalLink
        className="link"
        target="_blank"
        href={MetabaseSettings.docsUrl("dashboards/subscriptions")}
      >
        {t`Learn more`}
      </ExternalLink>
      .
    </Text>
  );
}

export default CaveatMessage;
