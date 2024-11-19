import { t } from "ttag";

import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const pkDrill: Drill<Lib.PKDrillThruInfo> = ({
  drill,
  drillInfo,
  applyDrill,
}) => {
  const { objectId } = drillInfo;

  return [
    {
      name: "pk",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "expand",
      default: true,
      question: () => applyDrill(drill, objectId),
    },
  ];
};
