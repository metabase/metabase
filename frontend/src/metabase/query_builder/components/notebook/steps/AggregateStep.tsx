import React from "react";
import { t } from "ttag";

import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

import type { Aggregation as IAggregation } from "metabase-types/api";
import type { NotebookStepUiComponentProps } from "../types";
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
      tetherOptions={aggTetherOptions}
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
