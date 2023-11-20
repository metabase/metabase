import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types";
import type { ZoomDrillThruInfo } from "metabase-lib";

export const ZoomBinsDrill: Drill<ZoomDrillThruInfo> = ({
  drill,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  return [
    {
      name: "zoom-in.bins",
      title: t`Zoom in`,
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => applyDrill(drill).setDefaultDisplay(),
    },
  ];
};
