import React from "react";
import { t } from "ttag";

import { EmptyBanner, ColoredIcon } from "./EmptyPinnedItemsBanner.styled";

function EmptyPinnedItemsBanner() {
  return (
    <EmptyBanner className={undefined}>
      <ColoredIcon name="pin" />
      {t`Save your questions, dashboards, and models in collections — and pin them to feature them at the top.`}
    </EmptyBanner>
  );
}

export default EmptyPinnedItemsBanner;
