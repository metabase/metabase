import { t } from "ttag";

import * as Lib from "metabase-lib";

import { AddAggregationButton } from "../AddAggregationButton";
import { AggregationItem } from "../AggregationItem";
import { BreakoutColumnList } from "../BreakoutColumnList";
import {
  AggregationsContainer,
  ColumnListContainer,
  SectionTitle,
} from "../SummarizeSidebar.styled";

import { STAGE_INDEX } from "./use-summarize-query";

export type SummarizeContentProps = {
  query: Lib.Query;
  aggregations: Lib.AggregationClause[];
  hasAggregations: boolean;
  onAddAggregation: (aggregations: Lib.Aggregable) => void;
  onUpdateAggregation: (
    aggregation: Lib.AggregationClause,
    nextAggregation: Lib.Aggregable,
  ) => void;
  onRemoveAggregation: (aggregation: Lib.AggregationClause) => void;
  onAddBreakout: (column: Lib.ColumnMetadata) => void;
  onUpdateBreakout: (
    clause: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => void;
  onRemoveBreakout: (column: Lib.ColumnMetadata) => void;
  onReplaceBreakouts: (column: Lib.ColumnMetadata) => void;
};

export const SummarizeContent = ({
  query,
  aggregations,
  hasAggregations,
  onAddAggregation,
  onUpdateAggregation,
  onRemoveAggregation,
  onAddBreakout,
  onUpdateBreakout,
  onRemoveBreakout,
  onReplaceBreakouts,
}: SummarizeContentProps) => {
  return (
    <>
      <AggregationsContainer>
        {aggregations.map(aggregation => (
          <AggregationItem
            key={
              Lib.displayInfo(query, STAGE_INDEX, aggregation).longDisplayName
            }
            query={query}
            aggregation={aggregation}
            onUpdate={nextAggregation =>
              onUpdateAggregation(aggregation, nextAggregation)
            }
            onRemove={() => onRemoveAggregation(aggregation)}
          />
        ))}
        <AddAggregationButton
          query={query}
          onAddAggregation={onAddAggregation}
        />
      </AggregationsContainer>
      {hasAggregations && (
        <ColumnListContainer>
          <SectionTitle>{t`Group by`}</SectionTitle>
          <BreakoutColumnList
            query={query}
            onAddBreakout={onAddBreakout}
            onUpdateBreakout={onUpdateBreakout}
            onRemoveBreakout={onRemoveBreakout}
            onReplaceBreakout={onReplaceBreakouts}
          />
        </ColumnListContainer>
      )}
    </>
  );
};
