/* @flow */

import { ngettext, msgid } from "ttag";
import { inflect } from "metabase/lib/formatting";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

import { AggregationDimension } from "metabase-lib/lib/Dimension";

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

  // special case for aggregations that include a filter, such as share, count-where, and sum-where
  let extraFilter = null;
  const dimension =
    clicked.column && query.parseFieldReference(clicked.column.field_ref);
  if (dimension instanceof AggregationDimension) {
    const aggregation = dimension.aggregation();
    extraFilter =
      aggregation[0] === "count-where" || aggregation[0] === "share"
        ? aggregation[1]
        : aggregation[0] === "sum-where"
        ? aggregation[2]
        : null;
  }

  const recordName = query.table() && query.table().displayName();
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
      question: () => {
        const q = question.drillUnderlyingRecords(dimensions);
        if (extraFilter) {
          return (
            q
              .query()
              // $FlowFixMe: we know this is a StructuredQuery but flow doesn't
              .filter(extraFilter)
              .question()
          );
        } else {
          return q;
        }
      },
    },
  ];
};
