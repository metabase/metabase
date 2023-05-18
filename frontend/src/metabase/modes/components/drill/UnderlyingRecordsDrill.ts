import { ngettext, msgid } from "ttag";
import { inflect } from "metabase/lib/formatting/strings";
import {
  underlyingRecordsDrill,
  underlyingRecordsDrillQuestion,
} from "metabase-lib/queries/drills/underlying-records-drill";
import type { Drill } from "../../types";

export const UnderlyingRecordsDrill: Drill = ({ question, clicked }) => {
  const drill = underlyingRecordsDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { tableName, rowCount } = drill;

  const tableTitle = tableName
    ? inflect(tableName, rowCount)
    : ngettext(msgid`record`, `records`, rowCount);

  const actionTitle = ngettext(
    msgid`View this ${tableTitle}`,
    `View these ${tableTitle}`,
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
