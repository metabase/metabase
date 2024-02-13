import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import * as Lib from "metabase-lib";
import { AggregationPicker } from "../SummarizeSidebar.styled";
import { AggregationName, RemoveIcon, Root } from "./AggregationItem.styled";

const STAGE_INDEX = -1;

interface AggregationItemProps {
  query: Lib.Query;
  aggregation: Lib.AggregationClause;
  onUpdate: (nextAggregation: Lib.Aggregable) => void;
  onRemove: () => void;
}

export function AggregationItem({
  query,
  aggregation,
  onUpdate,
  onRemove,
}: AggregationItemProps) {
  const { displayName } = Lib.displayInfo(query, STAGE_INDEX, aggregation);

  const operators = Lib.selectedAggregationOperators(
    Lib.availableAggregationOperators(query, STAGE_INDEX),
    aggregation,
  );

  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <Root
          aria-label={displayName}
          onClick={onClick}
          data-testid="aggregation-item"
        >
          <AggregationName>{displayName}</AggregationName>
          <RemoveIcon name="close" onClick={onRemove} />
        </Root>
      )}
      popoverContent={({ closePopover }) => (
        <AggregationPicker
          query={query}
          stageIndex={STAGE_INDEX}
          clause={aggregation}
          operators={operators}
          hasExpressionInput={false}
          onSelect={nextAggregation => {
            onUpdate(nextAggregation);
            closePopover();
          }}
        />
      )}
    />
  );
}
