import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import * as Lib from "metabase-lib";

import { AddAggregationButton } from "./AddAggregationButton";
import { AggregationItem } from "./AggregationItem";
import { BreakoutColumnList } from "./BreakoutColumnList";
import {
  AggregationsContainer,
  ColumnListContainer,
  SectionTitle,
  SidebarView,
} from "./SummarizeSidebar.styled";

const STAGE_INDEX = -1;

interface SummarizeSidebarProps {
  className?: string;
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
}

export function SummarizeSidebar({
  className,
  query: initialQuery,
  onQueryChange,
  onClose,
}: SummarizeSidebarProps) {
  const [isDefaultAggregationRemoved, setDefaultAggregationRemoved] =
    useState(false);

  const query = useMemo(
    () => getQuery(initialQuery, isDefaultAggregationRemoved),
    [initialQuery, isDefaultAggregationRemoved],
  );

  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const hasAggregations = aggregations.length > 0;

  const handleAddAggregations = useCallback(
    (aggregations: Lib.Aggregable[]) => {
      const nextQuery = aggregations.reduce(
        (query, aggregation) => Lib.aggregate(query, STAGE_INDEX, aggregation),
        query,
      );
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleUpdateAggregation = useCallback(
    (aggregation: Lib.AggregationClause, nextAggregation: Lib.Aggregable) => {
      const nextQuery = Lib.replaceClause(
        query,
        STAGE_INDEX,
        aggregation,
        nextAggregation,
      );
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleRemoveAggregation = useCallback(
    (aggregation: Lib.AggregationClause) => {
      const nextQuery = Lib.removeClause(query, STAGE_INDEX, aggregation);
      const nextAggregations = Lib.aggregations(nextQuery, STAGE_INDEX);
      if (nextAggregations.length === 0) {
        setDefaultAggregationRemoved(true);
      }
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleAddBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.breakout(query, STAGE_INDEX, column);
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleUpdateBreakout = useCallback(
    (clause: Lib.BreakoutClause, column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceClause(query, STAGE_INDEX, clause, column);
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleRemoveBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const { breakoutPosition } = Lib.displayInfo(query, STAGE_INDEX, column);
      if (typeof breakoutPosition === "number") {
        const breakouts = Lib.breakouts(query, STAGE_INDEX);
        const clause = breakouts[breakoutPosition];
        const nextQuery = Lib.removeClause(query, STAGE_INDEX, clause);
        onQueryChange(nextQuery);
      }
    },
    [query, onQueryChange],
  );

  const handleReplaceBreakouts = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceBreakouts(query, STAGE_INDEX, column);
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleDoneClick = useCallback(() => {
    onQueryChange(query);
    onClose();
  }, [query, onQueryChange, onClose]);

  return (
    <SidebarView
      className={className}
      title={t`Summarize by`}
      color={color("summarize")}
      onDone={handleDoneClick}
    >
      <AggregationsContainer>
        {aggregations.map((aggregation, aggregationIndex) => (
          <AggregationItem
            key={
              Lib.displayInfo(query, STAGE_INDEX, aggregation).longDisplayName
            }
            query={query}
            aggregation={aggregation}
            aggregationIndex={aggregationIndex}
            onAdd={handleAddAggregations}
            onUpdate={nextAggregation =>
              handleUpdateAggregation(aggregation, nextAggregation)
            }
            onRemove={() => handleRemoveAggregation(aggregation)}
          />
        ))}
        <AddAggregationButton
          query={query}
          onAddAggregations={handleAddAggregations}
        />
      </AggregationsContainer>
      {hasAggregations && (
        <ColumnListContainer>
          <SectionTitle>{t`Group by`}</SectionTitle>
          <BreakoutColumnList
            query={query}
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
    !hasAggregations &&
    !Lib.isMetricBased(query, STAGE_INDEX) &&
    !isDefaultAggregationRemoved;

  if (!shouldAddDefaultAggregation) {
    return query;
  }

  return Lib.aggregateByCount(query);
}
