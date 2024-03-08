import { t } from "ttag";

import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const fkDetailsDrill: Drill<Lib.FKDetailsDrillThruInfo> = ({
  drill,
  drillInfo,
  applyDrill,
}) => {
  const { objectId, isManyPks } = drillInfo;

  return [
    {
      name: "fk-details",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      question: () => applyDrill(drill, objectId).setDefaultDisplay(),
      ...(!isManyPks ? { extra: () => ({ objectId }) } : {}),
    },
  ];
};
