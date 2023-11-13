import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";
import { getObjectDetailsActionExtraData } from "metabase/visualizations/click-actions/drills/mlv2/utils";

export const ObjectDetailsFkDrill: Drill<Lib.FKDetailsDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  const { objectId, "manyPks?": hasManyPKColumns } = drillDisplayInfo;

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      question: () => applyDrill(drill, objectId),
      ...getObjectDetailsActionExtraData({ objectId, hasManyPKColumns }),
    },
  ];
};
