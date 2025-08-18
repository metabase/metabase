import { push } from "react-router-redux";
import { t } from "ttag";

import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";
import type { Dispatch } from "metabase-types/store";

export const fkDetailsDrill: Drill<Lib.FKDetailsDrillThruInfo> = ({
  drill,
  drillInfo,
  applyDrill,
  clicked,
  question,
}) => {
  const metadata = question.metadata();
  const { objectId, isManyPks } = drillInfo;

  const targetField =
    typeof clicked.column?.id === "number"
      ? metadata.fields[clicked.column.id].target
      : undefined;
  const targetTableId = targetField?.table_id;

  return [
    {
      name: "fk-details",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      ...(targetTableId == null
        ? { question: () => applyDrill(drill, objectId).setDefaultDisplay() }
        : {
            action: () => (dispatch: Dispatch) => {
              dispatch(push(`/table/${targetTableId}/detail/${objectId}`));
            },
          }),
      ...(!isManyPks ? { extra: () => ({ objectId }) } : {}),
    },
  ];
};
