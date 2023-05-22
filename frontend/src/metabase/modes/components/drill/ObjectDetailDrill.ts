import { t } from "ttag";
import { zoomInRow } from "metabase/query_builder/actions";
import type { RowValue } from "metabase-types/api";
import type { Drill, ClickActionProps } from "metabase/modes/types";
import type Question from "metabase-lib/Question";
import {
  objectDetailDrill,
  objectDetailFKDrillQuestion,
  objectDetailPKDrillQuestion,
} from "metabase-lib/queries/drills/object-detail-drill";

type DrillType = "pk" | "fk" | "zoom" | "dashboard";

function getAction({
  question,
  clicked,
  type,
  objectId,
}: ClickActionProps & {
  question: Question;
  type: DrillType;
  objectId: RowValue;
}) {
  switch (type) {
    case "pk":
      return {
        question: () => objectDetailPKDrillQuestion({ question, clicked }),
      };
    case "fk":
      return {
        question: () => objectDetailFKDrillQuestion({ question, clicked }),
      };
    case "zoom":
      return { action: () => zoomInRow({ objectId }) };
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

const ObjectDetailDrill: Drill = ({ question, clicked }) => {
  const drill = objectDetailDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { type, objectId, hasManyPKColumns } = drill;

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "document",
      default: true,
      ...getAction({ question, clicked, type: type as DrillType, objectId }),
      ...getActionExtraData({ objectId, hasManyPKColumns }),
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ObjectDetailDrill;
