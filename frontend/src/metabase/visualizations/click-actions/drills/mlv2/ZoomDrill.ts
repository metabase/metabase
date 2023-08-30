import { t } from "ttag";
import type { DrillMLv2 } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";
import { zoomInRow } from "metabase/query_builder/actions";

export const ZoomToRowDrill: DrillMLv2<Lib.ZoomDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
}) => {
  if (!drill) {
    return [];
  }

  const { objectId } = drillDisplayInfo;

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      action: () => zoomInRow({ objectId }),
    },
  ];
};
