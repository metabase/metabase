import type { Drill } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";

export const ZoomTimeseriesDrill: Drill<Lib.ZoomTimeseriesDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
}) => {
  const { displayName } = drillDisplayInfo;

  return [
    {
      name: "timeseries-zoom",
      title: displayName,
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
