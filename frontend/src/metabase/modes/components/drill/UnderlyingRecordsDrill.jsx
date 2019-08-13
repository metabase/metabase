/* @flow */

import { ngettext, msgid } from "ttag";
import { inflect } from "metabase/lib/formatting";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  // removes post-aggregation filter stage
  clicked = clicked && question.topLevelClicked(clicked);
  question = question.topLevelQuestion();

  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  const dimensions = (clicked && clicked.dimensions) || [];
  if (!clicked || dimensions.length === 0) {
    return [];
  }

  // the metric value should be the number of rows that will be displayed
  const count = typeof clicked.value === "number" ? clicked.value : 2;

  const recordName = query.table().displayName();
  const inflectedTableName = recordName
    ? inflect(recordName, count)
    : ngettext(msgid`record`, `records`, count);
  return [
    {
      name: "underlying-records",
      section: "records",
      title: ngettext(
        msgid`View this ${inflectedTableName}`,
        `View these ${inflectedTableName}`,
        count,
      ),
      question: () => question.drillUnderlyingRecords(dimensions),
    },
  ];
};
