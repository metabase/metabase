import { useCallback, useLayoutEffect, useState } from "react";

import { useToggle } from "metabase/hooks/use-toggle";

import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";

import type { Expression as LegacyExpressionClause } from "metabase-types/api";
import * as Lib from "metabase-lib";

import { isExpression as isLegacyExpression } from "metabase-lib/expressions";
import LegacyFilter from "metabase-lib/queries/structured/Filter";
import type LegacyQuery from "metabase-lib/queries/StructuredQuery";

import { FilterColumnPicker } from "./FilterColumnPicker";
import { FilterPickerBody } from "./FilterPickerBody";
import type { ColumnListItem, SegmentListItem } from "./types";

export interface FilterPickerProps {
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  filterIndex?: number;

  legacyQuery: LegacyQuery;
  legacyFilter?: LegacyFilter;
  onSelectLegacy: (legacyFilter: LegacyFilter) => void;

  onSelect: (filter: Lib.ExpressionClause | Lib.SegmentMetadata) => void;
  onClose?: () => void;
}

export function FilterPicker({
  query,
  stageIndex,
  filter: initialFilter,
  filterIndex,
  legacyQuery,
  legacyFilter,
  onSelect,
  onSelectLegacy,
  onClose,
}: FilterPickerProps) {
  const [filter, setFilter] = useState(initialFilter);

  const [column, setColumn] = useState(
    getInitialColumn(query, stageIndex, filter),
  );

  const [
    isEditingExpression,
    { turnOn: openExpressionEditor, turnOff: closeExpressionEditor },
  ] = useToggle(isExpressionEditorInitiallyOpen(query, stageIndex, filter));

  const isNewFilter = !initialFilter;

  useLayoutEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const handleChange = (filter: Lib.ExpressionClause | Lib.SegmentMetadata) => {
    onSelect(filter);
    onClose?.();
  };

  const handleColumnSelect = (column: Lib.ColumnMetadata) => {
    setColumn(column);
    setFilter(undefined);
  };

  const checkItemIsSelected = useCallback(
    (item: ColumnListItem | SegmentListItem) => {
      return Boolean(
        filterIndex != null && item.filterPositions?.includes?.(filterIndex),
      );
    },
    [filterIndex],
  );

  const handleExpressionChange = useCallback(
    (name: string, expression: LegacyExpressionClause) => {
      if (Array.isArray(expression) && isLegacyExpression(expression)) {
        const baseFilter =
          legacyFilter || new LegacyFilter([], null, legacyQuery);
        const nextFilter = baseFilter.set(expression);
        onSelectLegacy(nextFilter);
        onClose?.();
      }
    },
    [legacyQuery, legacyFilter, onSelectLegacy, onClose],
  );

  const renderExpressionEditor = () => (
    <ExpressionWidget
      legacyQuery={legacyQuery}
      expression={legacyFilter?.raw() as LegacyExpressionClause}
      startRule="boolean"
      header={<ExpressionWidgetHeader onBack={closeExpressionEditor} />}
      onChangeExpression={handleExpressionChange}
      onClose={closeExpressionEditor}
    />
  );

  if (isEditingExpression) {
    return renderExpressionEditor();
  }

  if (!column) {
    return (
      <FilterColumnPicker
        query={query}
        stageIndex={stageIndex}
        checkItemIsSelected={checkItemIsSelected}
        onColumnSelect={handleColumnSelect}
        onSegmentSelect={handleChange}
        onExpressionSelect={openExpressionEditor}
      />
    );
  }

  return (
    <FilterPickerBody
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isNew={isNewFilter}
      onChange={handleChange}
      onBack={() => setColumn(undefined)}
    />
  );
}

function getInitialColumn(
  query: Lib.Query,
  stageIndex: number,
  filter?: Lib.FilterClause,
) {
  return filter
    ? Lib.filterParts(query, stageIndex, filter)?.column
    : undefined;
}

function isExpressionEditorInitiallyOpen(
  query: Lib.Query,
  stageIndex: number,
  filter?: Lib.FilterClause,
) {
  return (
    filter != null &&
    !Lib.isStandardFilter(query, stageIndex, filter) &&
    !Lib.isSegmentFilter(query, stageIndex, filter)
  );
}
