import { t } from "ttag";
import { zoomInRow } from "metabase/query_builder/actions";
import {
  objectDetailDashboardDrill,
  objectDetailFKDrill,
  objectDetailFKDrillQuestion,
  objectDetailPKDrill,
  objectDetailPKDrillQuestion,
  objectDetailZoomDrill,
} from "metabase-lib/lib/queries/drills/object-detail-drill";

function getAction({ question, clicked }) {
  if (objectDetailPKDrill({ question, clicked })) {
    return {
      question: () => objectDetailPKDrillQuestion({ question, clicked }),
    };
  }

  if (objectDetailDashboardDrill({ question, clicked })) {
    return { question: () => question };
  }

  if (objectDetailZoomDrill({ question, clicked })) {
    return { action: () => zoomInRow({ objectId: clicked.value }) };
  }

  if (objectDetailFKDrill({ question, clicked })) {
    return {
      question: () => objectDetailFKDrillQuestion({ question, clicked }),
    };
  }
}

export default ({ question, clicked }) => {
  const action = getAction({ question, clicked });
  if (!action) {
    return [];
  }

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "document",
      default: true,
      ...action,
    },
  ];
};
