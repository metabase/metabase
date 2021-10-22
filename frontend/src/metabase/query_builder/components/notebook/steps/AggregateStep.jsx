/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

import ClauseStep from "./ClauseStep";

const aggTetherOptions = {
  attachment: "top left",
  targetAttachment: "bottom left",
  offset: "0 10px",
  constraints: [
    {
      to: "scrollParent",
      attachment: "together",
    },
  ],
};

export default function AggregateStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  return (
    <ClauseStep
      color={color}
      initialAddText={t`Pick the metric you want to see`}
      items={query.aggregations()}
      tetherOptions={aggTetherOptions}
      renderPopover={aggregation => (
        <AggregationPopover
          query={query}
          aggregation={aggregation}
          onChangeAggregation={newAggregation =>
            aggregation
              ? aggregation.replace(newAggregation).update(updateQuery)
              : query.aggregate(newAggregation).update(updateQuery)
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={aggregation => aggregation.remove().update(updateQuery)}
      canRemove={aggregation => aggregation.canRemove()}
    />
  );
}
