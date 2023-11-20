import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";
import { zoomInRow } from "metabase/query_builder/actions";
import type { Dashboard } from "metabase-types/api";
import { getObjectDetailsActionExtraData } from "metabase/visualizations/click-actions/drills/mlv2/utils";
import type Question from "metabase-lib/Question";

export const ObjectDetailsZoomDrill: Drill<Lib.ZoomDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  clicked,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  const { objectId, isManyPks } = drillDisplayInfo;

  const getQuestion = () => applyDrill(drill, objectId);

  return [
    {
      name: "object-detail-zoom",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      ...getAction({
        objectId,
        dashboard: clicked?.extraData?.dashboard as Dashboard | undefined,
        getQuestion,
      }),
      ...getObjectDetailsActionExtraData({
        objectId,
        isManyPks,
      }),
    },
  ];
};

const getAction = ({
  objectId,
  dashboard,
  getQuestion,
}: {
  objectId: string | number;
  dashboard: Dashboard | undefined;
  getQuestion: () => Question;
}) => {
  if (dashboard != null) {
    return { question: getQuestion };
  }

  return { action: () => zoomInRow({ objectId }) };
};
