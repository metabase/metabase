import { t } from "ttag";
import { zoomInRow } from "metabase/query_builder/actions";

import type { RowValue } from "metabase-types/api";
import type { ClickObject, Drill, DrillOptions } from "metabase/modes/types";
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
}: DrillOptions & {
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
    case "zoom": {
      return {
        action: () =>
          zoomInRow({
            objectId,
            zoomedRowColumnIndex: getZoomedRowColumnIndex(clicked),
          }),
      };
    }
    case "dashboard":
      return { question: () => question };
  }
}

function getActionExtraData({
  objectId,
  zoomedRowColumnIndex,
  hasManyPKColumns,
}: {
  objectId: RowValue;
  zoomedRowColumnIndex?: number;
  hasManyPKColumns: boolean;
}) {
  if (!hasManyPKColumns) {
    return {
      extra: () => ({ objectId, zoomedRowColumnIndex }),
    };
  }
}

function getZoomedRowColumnIndex(clicked: ClickObject | undefined) {
  if (!clicked) {
    return;
  }

  const clickedColumnId = clicked?.column?.id;

  // This way to find the index does seem too complicated.
  // With it we can do drills in tables with reordered/hidden columns.
  // It ensures we find the correct column position
  // according to the way result rows/columns are ordered later when the drill happens.
  return clicked?.data?.findIndex(entry => clickedColumnId === entry.col.id);
}

const ObjectDetailDrill: Drill = ({ question, clicked }) => {
  const drill = objectDetailDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { type, objectId, hasManyPKColumns } = drill;

  const zoomedRowColumnIndex = getZoomedRowColumnIndex(clicked);

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "document",
      default: true,
      ...getAction({ question, clicked, type: type as DrillType, objectId }),
      ...getActionExtraData({
        objectId,
        hasManyPKColumns,
        zoomedRowColumnIndex,
      }),
    },
  ];
};

export default ObjectDetailDrill;
