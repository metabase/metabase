import { useCallback, useLayoutEffect, useState } from "react";

import { Box } from "metabase/ui";
import { useToggle } from "metabase/hooks/use-toggle";

import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";

import type { Expression as LegacyExpressionClause } from "metabase-types/api";
import * as Lib from "metabase-lib";

import { isExpression as isLegacyExpression } from "metabase-lib/expressions";
import LegacyFilter from "metabase-lib/queries/structured/Filter";
import type LegacyQuery from "metabase-lib/queries/StructuredQuery";

import type { ColumnListItem, SegmentListItem } from "./types";
import { MIN_WIDTH, MAX_WIDTH } from "./constants";

import { BooleanFilterPicker } from "./BooleanFilterPicker";
import { DateFilterPicker } from "./DateFilterPicker";
import { NumberFilterPicker } from "./NumberFilterPicker";
import { CoordinateFilterPicker } from "./CoordinateFilterPicker";
import { StringFilterPicker } from "./StringFilterPicker";
import { TimeFilterPicker } from "./TimeFilterPicker";
import { FilterColumnPicker } from "./FilterColumnPicker";

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
      query={legacyQuery}
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
      <Box miw={MIN_WIDTH} maw={MAX_WIDTH}>
        <FilterColumnPicker
          query={query}
          stageIndex={stageIndex}
          checkItemIsSelected={checkItemIsSelected}
          onColumnSelect={handleColumnSelect}
          onSegmentSelect={handleChange}
          onExpressionSelect={openExpressionEditor}
        />
      </Box>
    );
  }

  const FilterWidget = getFilterWidget(column);

  if (FilterWidget) {
    return (
      <Box miw={MIN_WIDTH}>
        <FilterWidget
          query={query}
          stageIndex={stageIndex}
          column={column}
          filter={filter}
          isNew={isNewFilter}
          onChange={handleChange}
          onBack={() => setColumn(undefined)}
        />
      </Box>
    );
  }

  // This codepath should never be hit,
  // but is here to make TypeScript happy
  return renderExpressionEditor();
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

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return BooleanFilterPicker;
  }
  if (Lib.isTime(column)) {
    return TimeFilterPicker;
  }
  if (Lib.isDate(column)) {
    return DateFilterPicker;
  }
  if (Lib.isCoordinate(column)) {
    return CoordinateFilterPicker;
  }
  if (Lib.isString(column)) {
    return StringFilterPicker;
  }
  if (Lib.isNumeric(column)) {
    return NumberFilterPicker;
  }
  return null;
}
