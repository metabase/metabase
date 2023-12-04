import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";

import * as Lib from "metabase-lib";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

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

  const query = useMemo(
    () => getQuery(initialQuery, isDefaultAggregationRemoved),
    [initialQuery, isDefaultAggregationRemoved],
  );

  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const hasAggregations = aggregations.length > 0;

  const legacyQuery = useMemo(() => {
    const question = initialLegacyQuery.question();
    return question
      .setDatasetQuery(Lib.toLegacyQuery(query))
      .query() as StructuredQuery;
  }, [query, initialLegacyQuery]);

  const handleAddAggregation = useCallback(
    (aggregation: Lib.Aggregable) => {
      const nextQuery = Lib.aggregate(query, STAGE_INDEX, aggregation);
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
        {aggregations.map(aggregation => (
          <AggregationItem
            key={
              Lib.displayInfo(query, STAGE_INDEX, aggregation).longDisplayName
            }
            query={query}
            aggregation={aggregation}
            legacyQuery={legacyQuery}
            onUpdate={nextAggregation =>
              handleUpdateAggregation(aggregation, nextAggregation)
            }
            onRemove={() => handleRemoveAggregation(aggregation)}
          />
        ))}
        <AddAggregationButton
          query={query}
          legacyQuery={legacyQuery}
          onAddAggregation={handleAddAggregation}
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
