import { msgid, ngettext } from "ttag";

import type {
  Drill,
  QuestionChangeClickAction,
} from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const underlyingRecordsDrill: Drill<
  Lib.UnderlyingRecordsDrillThruInfo
> = ({ drill, drillInfo, applyDrill }): QuestionChangeClickAction[] => {
  const { rowCount } = drillInfo;

  const actionTitle = ngettext(
    msgid`See this record`,
    `See these records`,
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
