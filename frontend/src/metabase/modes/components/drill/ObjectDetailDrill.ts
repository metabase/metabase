import { t } from "ttag";
import { zoomInRow } from "metabase/query_builder/actions";
import type { RowValue, DatasetColumn } from "metabase-types/api";
import type { ClickActionProps } from "metabase/modes/types";
import {
  QuestionChangeClickAction,
  ReduxClickAction,
} from "metabase/modes/types";
import type Question from "metabase-lib/Question";
import {
  objectDetailDrill,
  ObjectDetailDrillType,
  objectDetailFKDrillQuestion,
  objectDetailPKDrillQuestion,
} from "metabase-lib/queries/drills/object-detail-drill";

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
    case "pk":
      return {
        question: () =>
          objectDetailPKDrillQuestion({ question, column, objectId }),
      };

    case "fk":
      return {
        question: () =>
          objectDetailFKDrillQuestion({ question, column, objectId }),
      };

    case "dashboard":
      return { question: () => question };

    case "zoom":
      return { action: () => zoomInRow({ objectId }) };
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
}: ClickActionProps): [] | [ReduxClickAction | QuestionChangeClickAction] => {
  const drill = objectDetailDrill({ question, clicked });
  if (!drill || !clicked) {
    return [];
  }

  const { type, column, objectId, hasManyPKColumns } = drill;

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      ...getAction({ question, type, column, objectId }),
      ...getActionExtraData({ objectId, hasManyPKColumns }),
    },
  ];
};
