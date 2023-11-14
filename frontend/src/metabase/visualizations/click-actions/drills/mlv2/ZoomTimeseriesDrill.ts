import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types";
import type { ZoomTimeseriesDrillThruInfo } from "metabase-lib";

export const ZoomTimeseriesDrill: Drill<ZoomTimeseriesDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  const { displayName } = drillDisplayInfo;

  return [
    {
      name: "timeseries-zoom",
      title: t`${displayName}`,
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
