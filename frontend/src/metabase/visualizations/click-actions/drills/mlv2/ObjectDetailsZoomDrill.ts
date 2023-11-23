import { t } from "ttag";
import { zoomInRow } from "metabase/query_builder/actions";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const ObjectDetailsZoomDrill: Drill<Lib.ZoomDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  clicked,
  applyDrill,
}) => {
  const dashboard = clicked?.extraData?.dashboard;
  const { objectId, isManyPks } = drillDisplayInfo;

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      ...(dashboard
        ? { question: () => applyDrill(drill, objectId) }
        : { action: () => zoomInRow({ objectId }) }),
      ...(isManyPks ? { extra: () => ({ objectId }) } : {}),
    },
  ];
};
