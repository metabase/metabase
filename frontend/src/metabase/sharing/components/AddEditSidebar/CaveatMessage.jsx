import React from "react";
import { t } from "ttag";

import Text from "metabase/components/type/Text";

function CaveatMessage() {
  return (
    <Text className="mx4 my2 p2 bg-light text-dark rounded">
      {t`Charts delivered via your subscription may look slightly different from the charts in your dashboard, but the data will be the same.`}
    </Text>
  );
}

export default CaveatMessage;
