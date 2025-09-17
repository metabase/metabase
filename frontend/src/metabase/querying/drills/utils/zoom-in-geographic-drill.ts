import type { Drill } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";

export const zoomInGeographicDrill: Drill<Lib.ZoomGeographicDrillThruInfo> = ({
  drill,
  applyDrill,
  drillInfo,
}) => {
  return [
    {
      name: "zoom-in.geographic",
      title: drillInfo.displayName,
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => applyDrill(drill).setDefaultDisplay(),
    },
  ];
};
