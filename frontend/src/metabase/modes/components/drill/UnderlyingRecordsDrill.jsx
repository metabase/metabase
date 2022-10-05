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

  const tableTitle = drill.tableName
    ? inflect(drill.tableName, drill.rowCount)
    : ngettext(msgid`record`, `records`, drill.rowCount);

  const actionTitle = ngettext(
    msgid`View this ${tableTitle}`,
    `View these ${tableTitle}`,
    drill.rowCount,
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
