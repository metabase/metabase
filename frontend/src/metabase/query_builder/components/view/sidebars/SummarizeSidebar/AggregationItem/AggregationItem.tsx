import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import * as Lib from "metabase-lib";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { AggregationPicker } from "../SummarizeSidebar.styled";
import { AggregationName, RemoveIcon, Root } from "./AggregationItem.styled";

const STAGE_INDEX = -1;

interface AggregationItemProps {
  query: Lib.Query;
  aggregation: Lib.AggregationClause;
  aggregationIndex: number;
  legacyQuery: StructuredQuery;
  onUpdate: (nextAggregation: Lib.Aggregable) => void;
  onRemove: () => void;
  onLegacyQueryChange: (nextLegacyQuery: StructuredQuery) => void;
}

export function AggregationItem({
  query,
  aggregation,
  aggregationIndex,
  legacyQuery,
  onUpdate,
  onRemove,
  onLegacyQueryChange,
}: AggregationItemProps) {
  const { displayName } = Lib.displayInfo(query, STAGE_INDEX, aggregation);

  const operators = Lib.selectedAggregationOperators(
    Lib.availableAggregationOperators(query, STAGE_INDEX),
    aggregation,
  );

  const legacyClause = legacyQuery.aggregations()[aggregationIndex];

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
          operators={operators}
          hasExpressionInput={false}
          legacyQuery={legacyQuery}
          legacyClause={legacyClause}
          onSelect={nextAggregation => {
            onUpdate(nextAggregation);
            closePopover();
          }}
          onSelectLegacy={legacyAggregation => {
            onLegacyQueryChange(
              legacyQuery.updateAggregation(
                aggregationIndex,
                legacyAggregation,
              ),
            );
            closePopover();
          }}
        />
      )}
    />
  );
}
