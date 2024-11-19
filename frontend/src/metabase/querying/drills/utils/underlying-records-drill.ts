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

  const tableTitle =
    tableName && isShortTableName(tableName)
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
      icon: "table_spaced",
      buttonType: "horizontal",
      question: () =>
        applyDrill(drill)
          .setDisplay("table")
          .updateSettings({ "table.pivot": false }),
    },
  ];
};
