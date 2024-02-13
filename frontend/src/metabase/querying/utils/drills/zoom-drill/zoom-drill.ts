import { t } from "ttag";
import { zoomInRow } from "metabase/query_builder/actions";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const zoomDrill: Drill<Lib.ZoomDrillThruInfo> = ({
  drill,
  drillInfo,
  isDashboard,
  applyDrill,
}) => {
  const { objectId, isManyPks } = drillInfo;

  return [
    {
      name: "zoom",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      ...(isDashboard
        ? { question: () => applyDrill(drill, objectId) }
        : { action: () => zoomInRow({ objectId }) }),
      ...(!isManyPks ? { extra: () => ({ objectId }) } : {}),
    },
  ];
};
