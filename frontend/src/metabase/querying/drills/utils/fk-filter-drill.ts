import dayjs from "dayjs";
import { t } from "ttag";

import {
  pluralize,
  singularize,
  stripId,
} from "metabase/lib/formatting/strings";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const fkFilterDrill: Drill<Lib.FKFilterDrillThruInfo> = ({
  drill,
  drillInfo,
  applyDrill,
}) => {
  const { tableName, columnName, isNull } = drillInfo;
  const locale = dayjs.locale();
  const tableTitle = locale === "en" ? pluralize(tableName) : tableName;
  const columnTitle =
    locale === "en" ? singularize(stripId(columnName)) : stripId(columnName);
  const title = isNull
    ? t`View ${tableTitle} with no ${columnTitle}`
    : t`View this ${columnTitle}'s ${tableTitle}`;

  return [
    {
      name: "fk-filter",
      title,
      section: "standalone_filter",
      icon: "filter",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
