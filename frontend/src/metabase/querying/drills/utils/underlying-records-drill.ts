import dayjs from "dayjs";
import { msgid, ngettext } from "ttag";

import { inflect } from "metabase/lib/formatting/strings";
import type {
  Drill,
  QuestionChangeClickAction,
} from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

const isShortTableName = (tableName: string) => tableName.length <= 20;

export const underlyingRecordsDrill: Drill<
  Lib.UnderlyingRecordsDrillThruInfo
> = ({ drill, drillInfo, applyDrill }): QuestionChangeClickAction[] => {
  const { tableName, rowCount } = drillInfo;
  const locale = dayjs.locale();

  const tableTitle =
    tableName && locale === "en" && isShortTableName(tableName)
      ? inflect(tableName, rowCount)
      : ngettext(msgid`record`, `records`, rowCount);

  const actionTitle = ngettext(
    // extra argument is required to avoid a collision with a singular form translation (metabase#33079)
    msgid`See this ${tableTitle}${""}`,
    `See these ${tableTitle}`,
    rowCount,
  );

  return [
    {
      name: "underlying-records",
      title: actionTitle,
      section: "records",
      icon: "table",
      buttonType: "horizontal",
      question: () =>
        applyDrill(drill)
          .setDisplay("table")
          // Sometimes the "graph.dimensions" setting lingers around
          // from a previous graph visualization, so we reset it here. (see metabase#55484)
          .updateSettings({ "table.pivot": false, "graph.dimensions": [] }),
    },
  ];
};
