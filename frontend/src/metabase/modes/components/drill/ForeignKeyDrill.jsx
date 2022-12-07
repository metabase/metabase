import { t } from "ttag";
import { pluralize, singularize } from "metabase/lib/formatting/strings";
import {
  foreignKeyDrill,
  foreignKeyDrillQuestion,
} from "metabase-lib/queries/drills/foreign-key-drill";

export default function ForeignKeyDrill({ question, clicked }) {
  const drill = foreignKeyDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { columnName, tableName } = drill;
  const columnTitle = singularize(columnName);
  const tableTitle = pluralize(tableName);

  return {
    name: "view-fks",
    section: "standalone_filter",
    buttonType: "horizontal",
    icon: "filter",
    title: t`View this ${columnTitle}'s ${tableTitle}`,
    question: () => foreignKeyDrillQuestion({ question, clicked }),
  };
}
