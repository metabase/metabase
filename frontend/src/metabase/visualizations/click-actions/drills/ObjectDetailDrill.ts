import { t } from "ttag";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import type {
  ClickActionProps,
  DefaultClickAction,
} from "metabase/visualizations/types";

import type Question from "metabase-lib/Question";
import type { ObjectDetailDrillType } from "metabase-lib/queries/drills/object-detail-drill";
import { objectDetailDrill } from "metabase-lib/queries/drills/object-detail-drill";

function getAction({
  question,
  type,
  objectId,
  column,
}: {
  question: Question;
  type: ObjectDetailDrillType;
  column: DatasetColumn;
  objectId: RowValue;
}) {
  switch (type) {
    case "dashboard":
      return { question: () => question };
  }
}

function getActionExtraData({
  objectId,
  hasManyPKColumns,
}: {
  objectId: RowValue;
  hasManyPKColumns: boolean;
}) {
  if (!hasManyPKColumns) {
    return {
      extra: () => ({ objectId }),
    };
  }
}

export const ObjectDetailDrill = ({
  question,
  clicked,
}: ClickActionProps): [] | DefaultClickAction[] => {
  const drill = objectDetailDrill({ question, clicked });
  if (!drill || !clicked) {
    return [];
  }

  const { type, column, objectId, hasManyPKColumns } = drill;

  const actionData = getAction({ question, type, column, objectId });

  if (!actionData) {
    return [];
  }

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      ...actionData,
      ...getActionExtraData({ objectId, hasManyPKColumns }),
    },
  ];
};
