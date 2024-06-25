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
  handleAddAggregations: (aggregations: Lib.Aggregable[]) => void;
  handleUpdateAggregation: (
    aggregation: Lib.AggregationClause,
    nextAggregation: Lib.Aggregable,
  ) => void;
  handleRemoveAggregation: (aggregation: Lib.AggregationClause) => void;
  handleAddBreakout: (column: Lib.ColumnMetadata) => void;
  handleUpdateBreakout: (
    clause: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => void;
  handleRemoveBreakout: (column: Lib.ColumnMetadata) => void;
  handleReplaceBreakouts: (column: Lib.ColumnMetadata) => void;
};

export const SummarizeContent = ({
  query,
  aggregations,
  hasAggregations,
  handleAddAggregations,
  handleUpdateAggregation,
  handleRemoveAggregation,
  handleAddBreakout,
  handleUpdateBreakout,
  handleRemoveBreakout,
  handleReplaceBreakouts,
}: SummarizeContentProps) => {
  return (
    <>
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
    </>
  );
};
