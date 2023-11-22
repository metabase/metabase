import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const ObjectDetailsFkDrill: Drill<Lib.FKDetailsDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
}) => {
  const { objectId, isManyPks } = drillDisplayInfo;

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      question: () => applyDrill(drill, objectId),
      ...(isManyPks ? { extra: () => ({ objectId }) } : {}),
    },
  ];
};
