import type { Drill } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";

export const zoomInTimeseriesDrill: Drill<Lib.ZoomTimeseriesDrillThruInfo> = ({
  drill,
  drillInfo,
  clicked,
  applyDrill,
}) => {
  const isDashboard = clicked?.extraData?.dashboard != null;
  return [
    {
      name: "zoom-in.timeseries",
      title: drillInfo.displayName,
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
