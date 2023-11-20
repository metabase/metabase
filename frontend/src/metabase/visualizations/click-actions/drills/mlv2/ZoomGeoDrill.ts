import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types";
import type { ZoomDrillThruInfo } from "metabase-lib";

export const ZoomGeoDrill: Drill<ZoomDrillThruInfo> = ({
  drill,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  return [
    {
      name: "timeseries-zoom",
      title: t`Zoom in`,
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => applyDrill(drill).setDefaultDisplay(),
    },
  ];
};
