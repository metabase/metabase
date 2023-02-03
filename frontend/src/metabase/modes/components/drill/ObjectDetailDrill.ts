import { t } from "ttag";
import { zoomInRow } from "metabase/query_builder/actions";

import type { RowValue } from "metabase-types/api";
import type Question from "metabase-lib/Question";

import {
  objectDetailDrill,
  objectDetailFKDrillQuestion,
  objectDetailPKDrillQuestion,
} from "metabase-lib/queries/drills/object-detail-drill";

import type { Drill, DrillOptions } from "../../types";

type DrillType = "pk" | "fk" | "zoom" | "dashboard";

function getAction({
  question,
  clicked,
  type,
  objectId,
}: DrillOptions & { question: Question; type: DrillType; objectId: RowValue }) {
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
      return {
        action: () => zoomInRow({ objectId, tableId: clicked.column.table_id }),
      };
    case "dashboard":
      return { question: () => question };
  }
}

function getActionExtraData({
  objectId,
  zoomedRowTableId,
  hasManyPKColumns,
}: {
  objectId: RowValue;
  zoomedRowTableId?: number;
  hasManyPKColumns: boolean;
}) {
  if (!hasManyPKColumns) {
    return {
      extra: () => ({ objectId, zoomedRowTableId }),
    };
  }
}

const ObjectDetailDrill: Drill = ({ question, clicked }) => {
  const drill = objectDetailDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { type, objectId, hasManyPKColumns } = drill;

  const zoomedRowTableId = clicked.column.table_id;

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "document",
      default: true,
      ...getAction({ question, clicked, type: type as DrillType, objectId }),
      ...getActionExtraData({ objectId, zoomedRowTableId, hasManyPKColumns }),
    },
  ];
};

export default ObjectDetailDrill;
