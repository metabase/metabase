import { useState } from "react";
import { t } from "ttag";

import { Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import { AggregationPicker } from "../SummarizeSidebar.styled";

import { AddAggregationButtonRoot } from "./AddAggregationButton.styled";

const STAGE_INDEX = -1;

interface AddAggregationButtonProps {
  query: Lib.Query;
  onAddAggregation: (aggregation: Lib.Aggregable) => void;
}

export function AddAggregationButton({
  query,
  onAddAggregation,
}: AddAggregationButtonProps) {
  const [isOpened, setIsOpened] = useState(false);
  const hasAggregations = Lib.aggregations(query, STAGE_INDEX).length > 0;
  const operators = Lib.availableAggregationOperators(query, STAGE_INDEX);

  return (
    <Popover opened={isOpened} onClose={() => setIsOpened(false)}>
      <Popover.Target>
        <Tooltip label={t`Add a metric`}>
          <AddAggregationButtonRoot
            icon="add"
            borderless
            onlyIcon={hasAggregations}
            onClick={() => setIsOpened(!isOpened)}
            aria-label={t`Add aggregation`}
            data-testid="add-aggregation-button"
          >
            {hasAggregations ? null : t`Add a metric`}
          </AddAggregationButtonRoot>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <AggregationPicker
          query={query}
          stageIndex={STAGE_INDEX}
          operators={operators}
          hasExpressionInput={false}
          onSelect={aggregation => {
            onAddAggregation(aggregation);
            setIsOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
