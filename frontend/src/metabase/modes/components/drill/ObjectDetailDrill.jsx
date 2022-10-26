import { t } from "ttag";
import { zoomInRow } from "metabase/query_builder/actions";
import {
  objectDetailDrill,
  objectDetailFKDrillQuestion,
  objectDetailPKDrillQuestion,
} from "metabase-lib/queries/drills/object-detail-drill";

function getAction({ question, clicked, type, objectId }) {
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

function getActionExtraData({ objectId, hasManyPKColumns }) {
  if (!hasManyPKColumns) {
    return {
      extra: () => ({ objectId }),
    };
  }
}

export default ({ question, clicked }) => {
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
      ...getAction({ question, clicked, type, objectId }),
      ...getActionExtraData({ objectId, hasManyPKColumns }),
    },
  ];
};
