import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/content-translation/plugins";
import {
  AggregationPicker,
  isExpressionEditorInitiallyOpen,
} from "metabase/querying/common/components/AggregationPicker";
import * as Lib from "metabase-lib";

import {
  ExpressionWidget,
  prefetchExpressionWidget,
} from "../../../components/expressions/ExpressionWidget";
import type { NotebookStepProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

type AggregateStepProps = NotebookStepProps & {
  inlineEditorContainer?: HTMLElement | null;
};

export function AggregateStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
  inlineEditorContainer,
}: AggregateStepProps) {
  const { question, stageIndex } = step;
  const isMetric = question.type() === "metric";
  const tc = useTranslateContent();
  const { locale } = useLocale();

  useEffect(() => {
    prefetchExpressionWidget();
  }, []);

  const aggregations = useMemo(() => {
    return Lib.aggregations(query, stageIndex);
  }, [query, stageIndex]);

  const hasAddButton = !readOnly && (!isMetric || aggregations.length === 0);
  const hasRemoveButton = !readOnly && !isMetric;

  const handleReorderAggregation = (
    sourceClause: Lib.AggregationClause,
    targetClause: Lib.AggregationClause,
  ) => {
    const nextQuery = Lib.swapClauses(
      query,
      stageIndex,
      sourceClause,
      targetClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveAggregation = (clause: Lib.AggregationClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  const renderAggregationName = (aggregation: Lib.AggregationClause) =>
    PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
      displayName: Lib.displayInfo(query, stageIndex, aggregation)
        .longDisplayName,
      tc,
      locale,
    });

  return (
    <ClauseStep
      items={aggregations}
      initialAddText={t`Pick a function or metric`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      hasAddButton={hasAddButton}
      hasRemoveButton={hasRemoveButton}
      renderName={renderAggregationName}
      renderPopover={({
        item: aggregation,
        index,
        onClose,
        openInlineEditor,
      }) => (
        <AggregationPopover
          query={query}
          stageIndex={stageIndex}
          clause={aggregation}
          clauseIndex={index}
          onQueryChange={updateQuery}
          onClose={onClose}
          onOpenExpressionEditor={openInlineEditor}
          readOnly={readOnly}
        />
      )}
      opensInlineEditor={(aggregation) =>
        aggregation != null &&
        isExpressionEditorInitiallyOpen({
          query,
          stageIndex,
          clause: aggregation,
          operators: Lib.selectedAggregationOperators(
            Lib.availableAggregationOperators(query, stageIndex),
            aggregation,
          ),
          readOnly,
        })
      }
      renderInlineEditor={({
        item: aggregation,
        index,
        initialExpressionClause,
        onClose,
      }) => (
        <InlineAggregationEditor
          query={query}
          stageIndex={stageIndex}
          clause={aggregation}
          clauseIndex={index}
          initialExpressionClause={initialExpressionClause}
          onQueryChange={updateQuery}
          onClose={onClose}
        />
      )}
      inlineEditorContainer={inlineEditorContainer}
      onReorder={handleReorderAggregation}
      onRemove={handleRemoveAggregation}
      data-testid="aggregate-step"
    />
  );
}

interface AggregationPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  clause?: Lib.AggregationClause;
  clauseIndex?: number;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
  onOpenExpressionEditor?: (clause: Lib.DefinedClauseName | null) => void;
  readOnly?: boolean;
}

interface InlineAggregationEditorProps {
  query: Lib.Query;
  stageIndex: number;
  clause?: Lib.AggregationClause;
  clauseIndex?: number;
  initialExpressionClause: Lib.DefinedClauseName | null;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
}

function InlineAggregationEditor({
  query,
  stageIndex,
  clause,
  clauseIndex,
  initialExpressionClause,
  onQueryChange,
  onClose,
}: InlineAggregationEditorProps) {
  const availableColumns = useMemo(
    () => Lib.aggregableColumns(query, stageIndex, clauseIndex),
    [query, stageIndex, clauseIndex],
  );
  const availableMetrics = useMemo(
    () => Lib.availableMetrics(query, stageIndex),
    [query, stageIndex],
  );

  const handleChangeClause = (
    name: string,
    nextClause: Lib.AggregationClause | Lib.ExpressionClause,
  ) => {
    const namedClause = Lib.withExpressionName(nextClause, name);
    const nextQuery = clause
      ? Lib.replaceClause(query, stageIndex, clause, namedClause)
      : Lib.aggregate(query, stageIndex, namedClause);
    onQueryChange(nextQuery);
  };

  return (
    <ExpressionWidget
      query={query}
      stageIndex={stageIndex}
      availableColumns={availableColumns}
      availableMetrics={availableMetrics}
      name={clause && Lib.displayInfo(query, stageIndex, clause).displayName}
      clause={clause}
      withName
      expressionMode="aggregation"
      expressionIndex={clauseIndex}
      variant="inline"
      onChangeClause={handleChangeClause}
      onClose={onClose}
      initialExpressionClause={initialExpressionClause}
    />
  );
}

function AggregationPopover({
  query,
  stageIndex,
  clause,
  clauseIndex,
  onQueryChange,
  onClose,
  onOpenExpressionEditor,
  readOnly,
}: AggregationPopoverProps) {
  const isUpdate = clause != null && clauseIndex != null;

  const operators = useMemo(() => {
    const baseOperators = Lib.availableAggregationOperators(query, stageIndex);
    return isUpdate
      ? Lib.selectedAggregationOperators(baseOperators, clause)
      : baseOperators;
  }, [query, clause, stageIndex, isUpdate]);

  return (
    <AggregationPicker
      query={query}
      stageIndex={stageIndex}
      clause={clause}
      clauseIndex={clauseIndex}
      operators={operators}
      allowCustomExpressions
      onQueryChange={onQueryChange}
      onClose={onClose}
      onOpenExpressionEditor={onOpenExpressionEditor}
      readOnly={readOnly}
    />
  );
}
