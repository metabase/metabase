import { t } from "ttag";
import {
  pluralize,
  singularize,
  stripId,
} from "metabase/lib/formatting/strings";
import type { DrillMLv2 } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const FKFilterDrill: DrillMLv2<Lib.FKFilterDrillThruInfo> = ({
  drill,
  applyDrill,
  question,
  clicked,
}) => {
  if (!drill || !clicked?.column) {
    return [];
  }

  const columnName = singularize(stripId(clicked.column?.display_name));
  const tableName = question.table()?.display_name;

  if (!tableName) {
    return [];
  }
  const tableTitle = pluralize(tableName);

  return [
    {
      name: "view-fks",
      title: t`View this ${columnName}'s ${tableTitle}`,
      section: "standalone_filter",
      icon: "filter",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
