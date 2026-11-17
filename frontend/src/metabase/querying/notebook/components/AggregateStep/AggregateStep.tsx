import { type JSX, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/content-translation/plugins";
import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import { formatIdentifier } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import type { GeneratedBreakout } from "../../../components/expressions/Editor/api";
import type { NotebookStepProps } from "../../types";
import { ClauseStep, useInlineClauseEditor } from "../ClauseStep";
import { ExpressionPill } from "../ExpressionStep/ExpressionPill";
import {
  InlineExpressionEditor,
  useInlineExpressionEditorChunk,
} from "../InlineExpressionEditor";

export function AggregateStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  reportTimezone,
  updateQuery,
  editorSlot,
}: NotebookStepProps & {
  /** Where the inline expression editor goes, in place of below the cell. */
  editorSlot?: HTMLElement | null;
}) {
  const { question, stageIndex } = step;
  useInlineExpressionEditorChunk();
  const isMetric = question.type() === "metric";
  const tc = useTranslateContent();
  const { locale } = useLocale();

  const aggregations = useMemo(() => {
    return Lib.aggregations(query, stageIndex);
  }, [query, stageIndex]);

  // An edit keeps the name of a named aggregation, unless the AI gives a new
  // one.
  const replaceAggregation = useCallback(
    (
      query: Lib.Query,
      stageIndex: number,
      existing: Lib.AggregationClause,
      clause: Lib.ExpressionClause,
    ) => {
      const info = Lib.displayInfo(query, stageIndex, existing);
      const named = info.isNamed
        ? Lib.withExpressionName(clause, info.displayName)
        : clause;
      return Lib.replaceClause(query, stageIndex, existing, named);
    },
    [],
  );
  const inline = useInlineClauseEditor({
    query,
    stageIndex,
    getClauses: Lib.aggregations,
    addClause: Lib.aggregate,
    replaceClause: replaceAggregation,
    updateQuery,
  });
  const handleCommit = (clause: Lib.ExpressionClause, name?: string) =>
    inline.commit(name != null ? Lib.withExpressionName(clause, name) : clause);

  const availableColumns = useMemo(
    () => Lib.aggregableColumns(query, stageIndex, inline.editedIndex),
    [query, stageIndex, inline.editedIndex],
  );
  const availableMetrics = useMemo(
    () => Lib.availableMetrics(query, stageIndex),
    [query, stageIndex],
  );

  const isCustomAggregation = (aggregation: Lib.AggregationClause) => {
    if (Lib.displayInfo(query, stageIndex, aggregation).isNamed) {
      return true;
    }
    const parts: unknown = Lib.expressionParts(query, stageIndex, aggregation);
    if (Lib.isMetricMetadata(parts) || Lib.isMeasureMetadata(parts)) {
      return false;
    }
    const operators = Lib.selectedAggregationOperators(
      Lib.availableAggregationOperators(query, stageIndex),
      aggregation,
    );
    return !operators.some(
      (operator) => Lib.displayInfo(query, stageIndex, operator).selected,
    );
  };

  const handleRename = (aggregation: Lib.AggregationClause, name: string) =>
    updateQuery(
      Lib.replaceClause(
        query,
        stageIndex,
        aggregation,
        Lib.withExpressionName(aggregation, name),
      ),
    );

  // The AI can also change the group-by columns of the step.
  const breakoutNames = Lib.breakouts(query, stageIndex).map((breakout) =>
    formatIdentifier(
      Lib.displayInfo(query, stageIndex, breakout).longDisplayName,
    ),
  );
  const handleAcceptBreakouts = (breakouts: GeneratedBreakout[]) => {
    const current = inline.queryRef.current;
    const withoutBreakouts = Lib.breakouts(current, stageIndex).reduceRight(
      (query, breakout) => Lib.removeClause(query, stageIndex, breakout),
      current,
    );
    const nextQuery = breakouts.reduce((query, { column, unit }) => {
      const found = findBreakoutColumn(query, stageIndex, column, unit);
      return found != null ? Lib.breakout(query, stageIndex, found) : query;
    }, withoutBreakouts);
    inline.queryRef.current = nextQuery;
    updateQuery(nextQuery);
  };

  const editedInfo =
    inline.editedClause != null
      ? Lib.displayInfo(query, stageIndex, inline.editedClause)
      : undefined;

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

  const handleRemoveAggregation = (
    clause: Lib.AggregationClause,
    index: number,
  ) => {
    inline.handleRemoved(index);
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
      renderInlineItem={(aggregation, index) =>
        isCustomAggregation(aggregation) || inline.editedIndex === index ? (
          <ExpressionPill
            hasStepSelectedColor
            name={renderAggregationName(aggregation)}
            color={color}
            isActive={inline.editedIndex === index}
            readOnly={readOnly}
            hasRemoveButton={hasRemoveButton}
            onOpen={() => inline.open({ kind: "clause", index })}
            onRename={(name) => handleRename(aggregation, name)}
            onRemove={() => handleRemoveAggregation(aggregation, index)}
          />
        ) : null
      }
      extraItems={
        inline.isDraftOpen && (
          <ExpressionPill
            hasStepSelectedColor
            name={t`New summary`}
            color={color}
            isActive
            readOnly={readOnly}
            canRename={false}
            hasUnsavedChanges
            onOpen={noop}
            onRename={noop}
            onRemove={inline.close}
          />
        )
      }
      renderPopover={({ item: aggregation, index, onClose }) => (
        <AggregationPopover
          query={query}
          stageIndex={stageIndex}
          clause={aggregation}
          clauseIndex={index}
          onQueryChange={updateQuery}
          onClose={onClose}
          onOpenExpressionEditor={(clause) => {
            onClose();
            inline.open(
              index != null ? { kind: "clause", index } : { kind: "draft" },
              clause,
            );
          }}
          readOnly={readOnly}
        />
      )}
      onReorder={(source, target) => {
        inline.close();
        handleReorderAggregation(source, target);
      }}
      onRemove={handleRemoveAggregation}
      data-testid="aggregate-step"
    >
      {inline.openEditor != null &&
        renderInSlot(
          <InlineExpressionEditor
            key={inline.openEditor.session}
            query={query}
            stageIndex={stageIndex}
            expressionIndex={inline.editedIndex}
            expressionMode="aggregation"
            availableColumns={availableColumns}
            availableMetrics={availableMetrics}
            reportTimezone={reportTimezone}
            readOnly={readOnly}
            clause={inline.editedClause}
            name={editedInfo?.isNamed ? editedInfo.displayName : undefined}
            hasDefaultName={!editedInfo?.isNamed}
            initialExpressionClause={inline.openEditor.initialExpressionClause}
            breakouts={breakoutNames}
            onAcceptBreakouts={handleAcceptBreakouts}
            onCommit={handleCommit}
            onDone={inline.close}
            onDiscard={inline.close}
          />,
          editorSlot,
        )}
    </ClauseStep>
  );
}

interface AggregationPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  clause?: Lib.AggregationClause;
  clauseIndex?: number;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
  onOpenExpressionEditor: (clause: Lib.DefinedClauseName | null) => void;
  readOnly?: boolean;
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

const noop = () => {};

/** The column for a group-by column from the AI, with its time unit. */
function findBreakoutColumn(
  query: Lib.Query,
  stageIndex: number,
  name: string,
  unit: string | undefined,
) {
  const column = Lib.breakoutableColumns(query, stageIndex).find(
    (column) =>
      formatIdentifier(
        Lib.displayInfo(query, stageIndex, column).longDisplayName,
      ) === name,
  );
  if (column == null || unit == null) {
    return column;
  }
  const bucket = Lib.availableTemporalBuckets(query, stageIndex, column).find(
    (bucket) => Lib.displayInfo(query, stageIndex, bucket).shortName === unit,
  );
  return bucket != null ? Lib.withTemporalBucket(column, bucket) : column;
}

const renderInSlot = (
  node: JSX.Element,
  slot: HTMLElement | null | undefined,
) => (slot != null ? createPortal(node, slot) : node);
