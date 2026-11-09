import { useEffect, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/content-translation/hooks";
import {
  FilterPicker,
  isExpressionEditorInitiallyOpen,
} from "metabase/querying/filters/components/FilterPicker";
import { getTranslatedFilterDisplayName } from "metabase/querying/filters/utils/display";
import { memoize } from "metabase/utils/memoize";
import * as Lib from "metabase-lib";

import {
  ExpressionWidget,
  prefetchExpressionWidget,
} from "../../../components/expressions/ExpressionWidget";
import type { NotebookStepProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

export function FilterStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepProps) {
  const { stageIndex } = step;
  const tc = useTranslateContent();
  const { locale } = useLocale();

  useEffect(() => {
    prefetchExpressionWidget();
  }, []);

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

  const handleRemoveFilter = (clause: Lib.FilterClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  return (
    <ErrorBoundary>
      <ClauseStep
        items={filters}
        initialAddText={t`Add filters to narrow your answer`}
        readOnly={readOnly}
        color={color}
        isLastOpened={isLastOpened}
        renderName={renderFilterName}
        renderPopover={({ item: filter, index, onClose, openInlineEditor }) => (
          <FilterPopover
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            filterIndex={index}
            onAddFilter={handleAddFilter}
            onUpdateFilter={handleUpdateFilter}
            onClose={onClose}
            onOpenExpressionEditor={openInlineEditor}
            readOnly={readOnly}
          />
        )}
        opensInlineEditor={(filter) =>
          filter != null &&
          isExpressionEditorInitiallyOpen(query, stageIndex, filter)
        }
        renderInlineEditor={({
          item: filter,
          initialExpressionClause,
          onClose,
        }) => (
          <ExpressionWidget
            query={query}
            stageIndex={stageIndex}
            availableColumns={Lib.expressionableColumns(query, stageIndex)}
            clause={filter}
            expressionMode="filter"
            variant="inline"
            onChangeClause={(_name, clause) => {
              if (filter) {
                handleUpdateFilter(filter, clause);
              } else {
                handleAddFilter(clause);
              }
            }}
            onClose={onClose}
            initialExpressionClause={initialExpressionClause}
          />
        )}
        onReorder={handleReorderFilter}
        onRemove={handleRemoveFilter}
      />
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
  onOpenExpressionEditor?: (clause: Lib.DefinedClauseName | null) => void;
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
