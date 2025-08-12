import { push } from "react-router-redux";
import { t } from "ttag";

import type { Drill } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type { Dispatch } from "metabase-types/store";

export const pkDrill: Drill<Lib.PKDrillThruInfo> = ({
  drill,
  drillInfo,
  applyDrill,
  query,
}) => {
  const { objectId } = drillInfo;
  const tableId = Lib.sourceTableOrCardId(query);

  return [
    {
      name: "pk",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      ...(tableId == null
        ? {
            question: () => applyDrill(drill, objectId),
          }
        : {
            action: () => (dispatch: Dispatch) => {
              dispatch(push(`/table/${tableId}/detail/${objectId}`));
            },
          }),
    },
  ];
};
