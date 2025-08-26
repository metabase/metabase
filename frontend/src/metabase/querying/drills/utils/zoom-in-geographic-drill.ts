import { t } from "ttag";

import type { Drill } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";

const getTitle = ({
  subtype,
  columnType,
}: Lib.ZoomInGeographicDrillDetails): string => {
  if (subtype === "binned-lat-lon->binned-lat-lon") {
    return t`Zoom in: Lat/Lon`;
  }
  if (columnType === "City") {
    return t`Zoom in: City`;
  }
  if (columnType === "State") {
    return t`Zoom in: State`;
  }
  if (columnType === "Country") {
    return t`Zoom in: Country`;
  }
  return t`Zoom in`;
};

export const zoomInGeographicDrill: Drill<Lib.ZoomDrillThruInfo> = ({
  drill,
  applyDrill,
}) => {
  const details = Lib.zoomInGeographicDrillDetails(drill);
  return [
    {
      name: "zoom-in.geographic",
      title: getTitle(details),
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => applyDrill(drill).setDefaultDisplay(),
    },
  ];
};
