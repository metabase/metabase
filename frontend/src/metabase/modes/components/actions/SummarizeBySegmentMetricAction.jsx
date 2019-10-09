/* @flow */

import React from "react";
import { t } from "ttag";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

import type {
  ClickAction,
  ClickActionProps,
  ClickActionPopoverProps,
} from "metabase/meta/types/Visualization";

const EXCLUDE_AGGREGATIONS = new Set([
  "rows",
  "cum-sum",
  "cum-count",
  "stddev",
]);

const getAggregationOperatorsForSummarize = query => {
  return query
    .aggregationOperators()
    .filter(aggregation => !EXCLUDE_AGGREGATIONS.has(aggregation.short));
};

export default ({ question }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  return [
    {
      name: "summarize",
      title: t`Summarize this segment`,
      icon: "sum",
      // eslint-disable-next-line react/display-name
      popover: ({ onChangeCardAndRun, onClose }: ClickActionPopoverProps) => (
        <AggregationPopover
          query={query}
          aggregationOperators={getAggregationOperatorsForSummarize(query)}
          onChangeAggregation={aggregation => {
            onChangeCardAndRun({
              nextCard: question.aggregate(aggregation).card(),
            });
            onClose && onClose();
          }}
          onClose={onClose}
          showMetrics={false}
          showCustom={false}
        />
      ),
    },
  ];
};
