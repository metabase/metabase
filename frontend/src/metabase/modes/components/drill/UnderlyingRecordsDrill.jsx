import { ngettext, msgid } from "ttag";
import { inflect } from "metabase/lib/formatting/strings";
import {
  underlyingRecordsDrill,
  underlyingRecordsDrillQuestion,
} from "metabase-lib/lib/queries/drills/underlying-records-drill";

export default ({ question, clicked }) => {
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
      section: "records",
      buttonType: "horizontal",
      icon: "table_spaced",
      title: actionTitle,
      question: () => underlyingRecordsDrillQuestion({ question, clicked }),
    },
  ];
};
