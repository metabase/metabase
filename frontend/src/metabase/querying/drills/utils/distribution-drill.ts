import { t } from "ttag";

import type * as Lib from "metabase-lib";
import type { Drill } from "metabase/visualizations/types/click-actions";

export const distributionDrill: Drill<Lib.DistributionDrillThruInfo> = ({
  drill,
  applyDrill,
}) => {
  return [
    {
      name: "distribution",
      title: t`Distribution`,
      section: "summarize",
      icon: "bar",
      buttonType: "horizontal",
      question: () => applyDrill(drill).setDisplay("bar"),
    },
  ];
};
