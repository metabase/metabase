import { msgid, ngettext } from "ttag";
import { inflect } from "metabase/lib/formatting/strings";
import type {
  Drill,
  QuestionChangeClickAction,
} from "metabase/visualizations/types/click-actions";
import type { UnderlyingRecordsDrillThruInfo } from "metabase-lib";

const isShortTableName = (tableName: string) => tableName.length <= 20;

const getNormalizedValue = (value: unknown) => {
  const numberValue = typeof value === "number" ? value : 2;

  return numberValue < 0 ? 2 : numberValue;
};

export const UnderlyingRecordsDrill: Drill<UnderlyingRecordsDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
}): QuestionChangeClickAction[] => {
  if (!drill) {
    return [];
  }

  const { tableName, rowCount } = drillDisplayInfo;

  const normalizedCount = getNormalizedValue(rowCount);

  const tableTitle =
    tableName && isShortTableName(tableName)
      ? inflect(tableName, normalizedCount)
      : ngettext(msgid`record`, `records`, normalizedCount);

  const actionTitle = ngettext(
    // extra argument is required to avoid a collision with a singular form translation (metabase#33079)
    msgid`See this ${tableTitle}${""}`,
    `See these ${tableTitle}`,
    normalizedCount,
  );

  return [
    {
      name: "underlying-records",
      title: actionTitle,
      section: "records",
      icon: "table_spaced",
      buttonType: "horizontal",
      question: () => applyDrill(drill),
    },
  ];
};
