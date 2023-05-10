import { t } from "ttag";
import { pluralize, singularize } from "metabase/lib/formatting/strings";
import {
  foreignKeyDrill,
  foreignKeyDrillQuestion,
} from "metabase-lib/queries/drills/foreign-key-drill";
import type { Drill } from "../../types";

const ForeignKeyDrill: Drill = ({ question, clicked }) => {
  const drill = foreignKeyDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { columnName, tableName } = drill;
  const columnTitle = singularize(columnName);
  const tableTitle = pluralize(tableName);

  return [
    {
      name: "view-fks",
      title: t`View this ${columnTitle}'s ${tableTitle}`,
      section: "standalone_filter",
      icon: "filter",
      buttonType: "horizontal",
      question: () => foreignKeyDrillQuestion({ question, clicked }),
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ForeignKeyDrill;
