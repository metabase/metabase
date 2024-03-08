import type { Drill } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";

export const zoomInTimeseriesDrill: Drill<Lib.ZoomTimeseriesDrillThruInfo> = ({
  drill,
  drillInfo,
  isDashboard,
  applyDrill,
}) => {
  const { displayName } = drillInfo;

  return [
    {
      name: "zoom-in.timeseries",
      title: displayName,
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => {
        const question = applyDrill(drill);
        return isDashboard
          ? question.lockDisplay()
          : question.setDefaultDisplay();
      },
    },
  ];
};
