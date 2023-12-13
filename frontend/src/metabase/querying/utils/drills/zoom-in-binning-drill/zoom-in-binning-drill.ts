import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";

export const zoomInBinningDrill: Drill<Lib.ZoomDrillThruInfo> = ({
  drill,
  applyDrill,
}) => {
  return [
    {
      name: "zoom-in.binning",
      title: t`Zoom in`,
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => applyDrill(drill).setDefaultDisplay(),
    },
  ];
};
