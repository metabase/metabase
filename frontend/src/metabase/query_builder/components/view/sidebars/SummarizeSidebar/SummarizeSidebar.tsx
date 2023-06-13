import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import * as Lib from "metabase-lib";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { AddAggregationButton } from "./AddAggregationButton";
import { AggregationItem } from "./AggregationItem";
import { BreakoutColumnList } from "./BreakoutColumnList";
import {
  AggregationsContainer,
  AggregationPicker,
  ColumnListContainer,
  SectionTitle,
  SidebarView,
} from "./SummarizeSidebar.styled";

const STAGE_INDEX = -1;

interface SummarizeSidebarProps {
  className?: string;
  query: Lib.Query;
  legacyQuery: StructuredQuery;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
}

export function SummarizeSidebar({
  className,
  query: initialQuery,
  legacyQuery: initialLegacyQuery,
  onQueryChange,
  onClose,
}: SummarizeSidebarProps) {
  const [isDefaultAggregationRemoved, setDefaultAggregationRemoved] =
    useState(false);

  const [query, _setQuery] = useState(
    getQuery(initialQuery, isDefaultAggregationRemoved),
  );
  const [legacyQuery, _setLegacyQuery] = useState(initialLegacyQuery);

  const setQuery = useCallback(
    (nextQuery: Lib.Query, { run = true } = {}) => {
      const datasetQuery = Lib.toLegacyQuery(nextQuery);
      const nextLegacyQuery = legacyQuery.setDatasetQuery(datasetQuery);
      _setQuery(nextQuery);
      _setLegacyQuery(nextLegacyQuery);
      if (run) {
        onQueryChange(nextQuery);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onQueryChange],
  );

  const setLegacyQuery = useCallback((nextLegacyQuery: StructuredQuery) => {
    const nextQuery = nextLegacyQuery.question()._getMLv2Query();
    _setQuery(nextQuery);
    _setLegacyQuery(nextLegacyQuery);
  }, []);

  useEffect(() => {
    const nextQuery = getQuery(initialQuery, isDefaultAggregationRemoved);
    setQuery(nextQuery, { run: false });
  }, [initialQuery, isDefaultAggregationRemoved, setQuery]);

  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const hasAggregations = aggregations.length > 0;
  const operators = Lib.availableAggregationOperators(query, STAGE_INDEX);

  const handleDoneClick = useCallback(() => {
    onQueryChange(query);
    onClose();
  }, [query, onQueryChange, onClose]);

  const handleAddAggregation = useCallback(
    (aggregation: Lib.Aggregatable) => {
      const nextQuery = Lib.aggregate(query, STAGE_INDEX, aggregation);
      setQuery(nextQuery);
    },
    [query, setQuery],
  );

  const handleUpdateAggregation = useCallback(
    (aggregation: Lib.AggregationClause, nextAggregation: Lib.Aggregatable) => {
      const nextQuery = Lib.replaceClause(
        query,
        STAGE_INDEX,
        aggregation,
        nextAggregation,
      );
      setQuery(nextQuery);
    },
    [query, setQuery],
  );

  const handleRemoveAggregation = useCallback(
    (aggregation: Lib.AggregationClause) => {
      const nextQuery = Lib.removeClause(query, STAGE_INDEX, aggregation);
      const nextAggregations = Lib.aggregations(nextQuery, STAGE_INDEX);
      if (nextAggregations.length === 0) {
        setDefaultAggregationRemoved(true);
      }
      setQuery(nextQuery);
    },
    [query, setQuery],
  );

  const maybeApplyDefaultBucket = useCallback(
    (column: Lib.ColumnMetadata) => {
      const isBinned = Lib.binning(column) != null;
      const isBinnable = Lib.isBinnable(query, STAGE_INDEX, column);
      if (isBinnable && !isBinned) {
        return Lib.withDefaultBinning(query, STAGE_INDEX, column);
      }

      const isBucketed = Lib.temporalBucket(column) != null;
      const isBucketable = Lib.isTemporalBucketable(query, STAGE_INDEX, column);
      if (isBucketable && !isBucketed) {
        return Lib.withDefaultTemporalBucket(query, STAGE_INDEX, column);
      }

      return column;
    },
    [query],
  );

  const handleAddBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.breakout(
        query,
        STAGE_INDEX,
        maybeApplyDefaultBucket(column),
      );
      setQuery(nextQuery);
    },
    [query, maybeApplyDefaultBucket, setQuery],
  );

  const handleUpdateBreakout = useCallback(
    (clause: Lib.BreakoutClause, column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceClause(query, STAGE_INDEX, clause, column);
      setQuery(nextQuery);
    },
    [query, setQuery],
  );

  const handleRemoveBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const { breakoutPosition } = Lib.displayInfo(query, STAGE_INDEX, column);
      if (typeof breakoutPosition === "number") {
        const breakouts = Lib.breakouts(query, STAGE_INDEX);
        const clause = breakouts[breakoutPosition];
        const nextQuery = Lib.removeClause(query, STAGE_INDEX, clause);
        setQuery(nextQuery);
      }
    },
    [query, setQuery],
  );

  const handleReplaceBreakouts = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceBreakouts(
        query,
        STAGE_INDEX,
        maybeApplyDefaultBucket(column),
      );
      setQuery(nextQuery);
    },
    [query, setQuery, maybeApplyDefaultBucket],
  );

  const renderAggregationItem = useCallback(
    (aggregation: Lib.AggregationClause, clauseIndex: number) => {
      const { displayName, name } = Lib.displayInfo(
        query,
        STAGE_INDEX,
        aggregation,
      );
      return (
        <TippyPopoverWithTrigger
          key={name}
          renderTrigger={({ onClick }) => (
            <AggregationItem
              name={displayName}
              onClick={onClick}
              onRemove={() => handleRemoveAggregation(aggregation)}
            />
          )}
          popoverContent={({ closePopover }) => (
            <AggregationPicker
              query={query}
              stageIndex={STAGE_INDEX}
              operators={Lib.selectedAggregationOperators(
                operators,
                aggregation,
              )}
              hasExpressionInput={false}
              legacyQuery={legacyQuery}
              legacyClause={legacyQuery.aggregations()[clauseIndex]}
              onSelect={nextAggregation => {
                handleUpdateAggregation(aggregation, nextAggregation);
                closePopover();
              }}
              onSelectLegacy={legacyAggregation => {
                setLegacyQuery(
                  legacyQuery.updateAggregation(clauseIndex, legacyAggregation),
                );
                closePopover();
              }}
            />
          )}
        />
      );
    },
    [
      query,
      legacyQuery,
      operators,
      handleUpdateAggregation,
      handleRemoveAggregation,
      setLegacyQuery,
    ],
  );

  return (
    <SidebarView
      className={className}
      title={t`Summarize by`}
      color={color("summarize")}
      onDone={handleDoneClick}
    >
      <AggregationsContainer>
        {aggregations.map(renderAggregationItem)}
        <TippyPopoverWithTrigger
          renderTrigger={({ onClick }) => (
            <AddAggregationButton
              hasLabel={!hasAggregations}
              onClick={onClick}
            />
          )}
          popoverContent={({ closePopover }) => (
            <AggregationPicker
              query={query}
              legacyQuery={legacyQuery}
              stageIndex={STAGE_INDEX}
              operators={operators}
              onSelect={aggregation => {
                handleAddAggregation(aggregation);
                closePopover();
              }}
              onSelectLegacy={legacyAggregation => {
                setLegacyQuery(legacyQuery.aggregate(legacyAggregation));
                closePopover();
              }}
            />
          )}
        />
      </AggregationsContainer>
      {hasAggregations && (
        <ColumnListContainer>
          <SectionTitle>{t`Group by`}</SectionTitle>
          <BreakoutColumnList
            query={query}
            stageIndex={STAGE_INDEX}
            onAddBreakout={handleAddBreakout}
            onUpdateBreakout={handleUpdateBreakout}
            onRemoveBreakout={handleRemoveBreakout}
            onReplaceBreakout={handleReplaceBreakouts}
          />
        </ColumnListContainer>
      )}
    </SidebarView>
  );
}

function getQuery(query: Lib.Query, isDefaultAggregationRemoved: boolean) {
  const hasAggregations = Lib.aggregations(query, STAGE_INDEX).length > 0;
  const shouldAddDefaultAggregation =
    !hasAggregations && !isDefaultAggregationRemoved;

  const operator = Lib.availableAggregationOperators(query, STAGE_INDEX).find(
    operator => {
      const { shortName } = Lib.displayInfo(query, STAGE_INDEX, operator);
      return shortName === "count";
    },
  );

  if (operator && shouldAddDefaultAggregation) {
    const clause = Lib.aggregationClause(operator);
    return Lib.aggregate(query, STAGE_INDEX, clause);
  }

  return query;
}
