import { msgid, ngettext } from "ttag";
import { inflect } from "metabase/lib/formatting/strings";
import type { Drill } from "metabase/modes/types";
import {
  underlyingRecordsDrill,
  underlyingRecordsDrillQuestion,
} from "metabase-lib/queries/drills/underlying-records-drill";

const isShortTableName = (tableName: string) => tableName.length <= 20;

export const UnderlyingRecordsDrill: Drill = ({ question, clicked }) => {
  const drill = underlyingRecordsDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { tableName, rowCount } = drill;

  const tableTitle =
    tableName && isShortTableName(tableName)
      ? inflect(tableName, rowCount)
      : ngettext(msgid`record`, `records`, rowCount);

  const actionTitle = ngettext(
    msgid`See this ${tableTitle}`,
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
      question: () => underlyingRecordsDrillQuestion({ question, clicked }),
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UnderlyingRecordsDrill;
