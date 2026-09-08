import type * as Lib from "metabase-lib";
import type { Drill } from "metabase/visualizations/types";

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
