import { t } from "ttag";
import {
  pluralize,
  singularize,
  stripId,
} from "metabase/lib/formatting/strings";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const FKFilterDrill: Drill<Lib.FKFilterDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  const { tableName, columnName } = drillDisplayInfo;
  const tableTitle = pluralize(tableName);
  const columnTitle = singularize(stripId(columnName));

  return [
    {
      name: "view-fks",
      title: t`View this ${columnTitle}'s ${tableTitle}`,
      section: "standalone_filter",
      icon: "filter",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
