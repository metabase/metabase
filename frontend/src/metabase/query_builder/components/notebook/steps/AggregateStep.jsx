import React from "react";

import ClauseStep from "./ClauseStep";

import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

export default function AggregateStep({ color, query, ...props }) {
  return (
    <ClauseStep
      color={color}
      items={query.aggregations()}
      renderPopover={aggregation => (
        <AggregationPopover
          query={query}
          aggregation={aggregation}
          onChangeAggregation={newAggregation =>
            aggregation
              ? aggregation.replace(newAggregation).update()
              : query.addAggregation(newAggregation).update()
          }
        />
      )}
      onRemove={aggregation => aggregation.remove().update()}
    />
  );
}
