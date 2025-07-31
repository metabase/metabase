import { push } from "react-router-redux";
import { t } from "ttag";

import { zoomInRow } from "metabase/query_builder/actions";
import type { Drill } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type { Dispatch } from "metabase-types/store";

export const zoomDrill: Drill<Lib.ZoomDrillThruInfo> = ({
  drill,
  drillInfo,
  clicked,
  applyDrill,
  query,
}) => {
  const { objectId, isManyPks } = drillInfo;
  const isDashboard = clicked.extraData?.dashboard != null;
  const tableId = Lib.sourceTableOrCardId(query);

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
        : {
            action: () => (dispatch: Dispatch) => {
              if (tableId == null) {
                zoomInRow({ objectId });
              } else {
                dispatch(push(`/table/${tableId}/detail/${objectId}`));
              }
            },
          }),
      ...(!isManyPks ? { extra: () => ({ objectId }) } : {}),
    },
  ];
};
