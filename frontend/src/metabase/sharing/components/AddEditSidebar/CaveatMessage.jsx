import React from "react";
import { t } from "ttag";

import Text from "metabase/components/type/Text";

function CaveatMessage() {
  return (
    <Text className="mx4 my2 p2 bg-light text-dark rounded">
      {t`Charts in subscriptions may look slightly different from charts in dashboards.`}
    </Text>
  );
}

export default CaveatMessage;
