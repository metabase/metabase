import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Group, type GroupProps } from "metabase/ui";
import * as Lib from "metabase-lib";

import { AddAggregationButton } from "../AddAggregationButton";
import { AggregationItem } from "../AggregationItem";

import { STAGE_INDEX } from "./use-summarize-query";

type SummarizeAggregationItemListProps = {
  query: Lib.Query;
  aggregations: Lib.AggregationClause[];
  onAddAggregations: (aggregations: Lib.Aggregable[]) => void;
  onUpdateAggregation: (
    aggregation: Lib.AggregationClause,
    nextAggregation: Lib.Aggregable,
  ) => void;
  onRemoveAggregation: (aggregation: Lib.AggregationClause) => void;
} & GroupProps;

export const SummarizeAggregationItemList = ({
  query,
  aggregations,
  onAddAggregations,
  onUpdateAggregation,
  onRemoveAggregation,
  ...containerProps
}: SummarizeAggregationItemListProps) => (
  <Group
    spacing="sm"
    align="flex-start"
    className={cx(CS.overflowYScroll)}
    {...containerProps}
  >
    {aggregations.map((aggregation, aggregationIndex) => (
      <AggregationItem
        key={Lib.displayInfo(query, STAGE_INDEX, aggregation).longDisplayName}
        query={query}
        aggregation={aggregation}
        aggregationIndex={aggregationIndex}
        onAdd={onAddAggregations}
        onUpdate={nextAggregation =>
          onUpdateAggregation(aggregation, nextAggregation)
        }
        onRemove={() => onRemoveAggregation(aggregation)}
      />
    ))}
    <AddAggregationButton query={query} onAddAggregations={onAddAggregations} />
  </Group>
);
