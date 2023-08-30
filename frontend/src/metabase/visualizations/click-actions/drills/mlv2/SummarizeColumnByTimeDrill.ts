import { t } from "ttag";
import type { DrillMLv2 } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const SummarizeColumnByTimeDrill: DrillMLv2<
  Lib.SummarizeColumnByTimeDrillThruInfo
> = ({ drill, applyDrill }) => {
  if (!drill) {
    return [];
  }

  return [
    {
      name: "summarize-by-time",
      title: t`Sum over time`,
      section: "summarize",
      icon: "line",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
