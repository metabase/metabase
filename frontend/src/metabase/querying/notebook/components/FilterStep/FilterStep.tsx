import { useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { getTranslatedFilterDisplayName } from "metabase/querying/filters/utils/display";
import { memoize } from "metabase/utils/memoize";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { ClauseStep, useInlineClauseEditor } from "../ClauseStep";
import { ExpressionPill } from "../ExpressionStep/ExpressionPill";
import {
  InlineExpressionEditor,
  useInlineExpressionEditorChunk,
} from "../InlineExpressionEditor";

export function FilterStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  reportTimezone,
  updateQuery,
}: NotebookStepProps) {
  const { stageIndex } = step;
  useInlineExpressionEditorChunk();
  const inline = useInlineClauseEditor({
    query,
    stageIndex,
    getClauses: Lib.filters,
    addClause: Lib.filter,
    replaceClause: Lib.replaceClause,
    updateQuery,
  });
  const tc = useTranslateContent();
  const { locale } = useLocale();

  const filters = useMemo(
    () => Lib.filters(query, stageIndex),
    [query, stageIndex],
  );

  const renderFilterName = useMemo(
    () =>
      memoize((filter: Lib.FilterClause) =>
        getTranslatedFilterDisplayName(query, stageIndex, filter, tc, locale),
      ),
    [query, stageIndex, tc, locale],
  );

  const handleAddFilter = (clause: Lib.Filterable) => {
    const nextQuery = Lib.filter(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  const handleUpdateFilter = (
    targetClause: Lib.FilterClause,
    newClause: Lib.Filterable,
  ) => {
    const nextQuery = Lib.replaceClause(
      query,
      stageIndex,
      targetClause,
      newClause,
    );
    updateQuery(nextQuery);
  };

  const handleReorderFilter = (
    sourceClause: Lib.FilterClause,
    targetClause: Lib.FilterClause,
  ) => {
    const nextQuery = Lib.swapClauses(
      query,
      stageIndex,
      sourceClause,
      targetClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveFilter = (clause: Lib.FilterClause, index: number) => {
    inline.handleRemoved(index);
    const nextQuery = Lib.removeClause(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  const isCustomFilter = (filter: Lib.FilterClause) =>
    !Lib.isStandardFilter(query, stageIndex, filter) &&
    !Lib.isSegmentFilter(query, stageIndex, filter);

  const availableColumns = useMemo(
    () => Lib.expressionableColumns(query, stageIndex),
    [query, stageIndex],
  );

  return (
    <ErrorBoundary>
      <ClauseStep
        items={filters}
        initialAddText={t`Add filters to narrow your answer`}
        readOnly={readOnly}
        color={color}
        isLastOpened={isLastOpened}
        renderName={renderFilterName}
        renderInlineItem={(filter, index) =>
          isCustomFilter(filter) || inline.editedIndex === index ? (
            <ExpressionPill
              hasStepSelectedColor
              name={renderFilterName(filter)}
              color={color}
              isActive={inline.editedIndex === index}
              readOnly={readOnly}
              canRename={false}
              onOpen={() => inline.open({ kind: "clause", index })}
              onRename={noop}
              onRemove={() => handleRemoveFilter(filter, index)}
            />
          ) : null
        }
        extraItems={
          inline.isDraftOpen && (
            <ExpressionPill
              hasStepSelectedColor
              name={t`New filter`}
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
        renderPopover={({ item: filter, index, onClose }) => (
          <FilterPopover
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            filterIndex={index}
            onAddFilter={handleAddFilter}
            onUpdateFilter={handleUpdateFilter}
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
          handleReorderFilter(source, target);
        }}
        onRemove={handleRemoveFilter}
      >
        {inline.openEditor != null && (
          <InlineExpressionEditor
            key={inline.openEditor.session}
            query={query}
            stageIndex={stageIndex}
            expressionMode="filter"
            availableColumns={availableColumns}
            reportTimezone={reportTimezone}
            readOnly={readOnly}
            clause={inline.editedClause}
            hasDefaultName={false}
            initialExpressionClause={inline.openEditor.initialExpressionClause}
            onCommit={inline.commit}
            onDone={inline.close}
            onDiscard={inline.close}
          />
        )}
      </ClauseStep>
    </ErrorBoundary>
  );
}

interface FilterPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  filterIndex?: number;
  onAddFilter: (filter: Lib.Filterable) => void;
  onUpdateFilter: (
    targetFilter: Lib.FilterClause,
    nextFilter: Lib.Filterable,
  ) => void;
  onClose?: () => void;
  onOpenExpressionEditor: (clause: Lib.DefinedClauseName | null) => void;
  readOnly?: boolean;
}

function FilterPopover({
  query,
  stageIndex,
  filter,
  filterIndex,
  onAddFilter,
  onUpdateFilter,
  onClose,
  onOpenExpressionEditor,
  readOnly,
}: FilterPopoverProps) {
  return (
    <FilterPicker
      query={query}
      stageIndex={stageIndex}
      filter={filter}
      filterIndex={filterIndex}
      onSelect={(newFilter) => {
        if (filter) {
          onUpdateFilter(filter, newFilter);
        } else {
          onAddFilter(newFilter);
        }
      }}
      onClose={onClose}
      onOpenExpressionEditor={onOpenExpressionEditor}
      readOnly={readOnly}
    />
  );
}

const noop = () => {};
