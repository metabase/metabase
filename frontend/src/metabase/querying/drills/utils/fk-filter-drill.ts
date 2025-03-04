import { t } from "ttag";

import { stripId } from "metabase/lib/formatting/strings";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const fkFilterDrill: Drill<Lib.FKFilterDrillThruInfo> = ({
  drill,
  drillInfo,
  applyDrill,
}) => {
  const { tableName, columnName } = drillInfo;
  const columnTitle = stripId(columnName);

  return [
    {
      name: "fk-filter",
      title: t`View this ${columnTitle}'s ${tableName}`,
      section: "standalone_filter",
      icon: "filter",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
