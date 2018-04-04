/* @flow */

import { inflect } from "metabase/lib/formatting";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { t } from "c-3po";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
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

  return [
    {
      name: "underlying-records",
      section: "records",
      title: t`View ${inflect(t`these`, count, t`this`, t`these`)} ${inflect(
        query.table().display_name,
        count,
      )}`,
      question: () => question.drillUnderlyingRecords(dimensions),
    },
  ];
};
