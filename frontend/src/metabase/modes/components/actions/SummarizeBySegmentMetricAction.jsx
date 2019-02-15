/* @flow */

import React from "react";
import { t } from "c-3po";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

import type {
  ClickAction,
  ClickActionProps,
  ClickActionPopoverProps,
} from "metabase/meta/types/Visualization";

const omittedAggregations = ["rows", "cum-sum", "cum-count", "stddev"];
const getAggregationOptionsForSummarize = query => {
  return query
    .table()
    .aggregations()
    .filter(aggregation => !omittedAggregations.includes(aggregation.short));
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
          availableAggregations={getAggregationOptionsForSummarize(query)}
          onCommitAggregation={aggregation => {
            onChangeCardAndRun({
              nextCard: question.summarize(aggregation).card(),
            });
            onClose && onClose();
          }}
          onClose={onClose}
          showOnlyProvidedAggregations
        />
      ),
    },
  ];
};
