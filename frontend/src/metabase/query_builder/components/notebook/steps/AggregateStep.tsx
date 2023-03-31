import React from "react";
import { t } from "ttag";

import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

import type { Aggregation as IAggregation } from "metabase-types/types/Query";
import type { NotebookStepUiComponentProps } from "../types";
import ClauseStep from "./ClauseStep";

function AggregateStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  readOnly,
}: NotebookStepUiComponentProps) {
  return (
    <ClauseStep
      data-testid="aggregate-step"
      color={color}
      initialAddText={t`Pick the metric you want to see`}
      items={query.aggregations()}
      renderName={item => item.displayName()}
      readOnly={readOnly}
      renderPopover={aggregation => (
        <AggregationPopover
          query={query}
          aggregation={aggregation}
          onChangeAggregation={(newAggregation: IAggregation) =>
            aggregation
              ? updateQuery(aggregation.replace(newAggregation))
              : updateQuery(query.aggregate(newAggregation))
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={aggregation => updateQuery(aggregation.remove())}
      canRemove={aggregation => aggregation.canRemove()}
    />
  );
}

export default AggregateStep;
