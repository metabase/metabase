import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const DistributionDrill: Drill<Lib.DistributionDrillThruInfo> = ({
  drill,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  return [
    {
      name: "distribution",
      title: t`Distribution`,
      section: "summarize",
      icon: "bar",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
