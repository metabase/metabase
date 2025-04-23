import { useDisclosure } from "@mantine/hooks";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";
import * as Lib from "metabase-lib";

import {
  FilterColumnPicker,
  type FilterColumnPickerProps,
} from "./FilterColumnPicker";
import { FilterPickerBody } from "./FilterPickerBody";
import type { ColumnListItem, SegmentListItem } from "./types";

export type FilterPickerProps = {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  filterIndex?: number;

  onSelect: (filter: Lib.Filterable) => void;
  onClose?: () => void;
  onBack?: () => void;
} & Pick<
  FilterColumnPickerProps,
  "withColumnItemIcon" | "withColumnGroupIcon" | "withCustomExpression"
>;

export function FilterPicker({
  className,
  query,
  stageIndex,
  filter: initialFilter,
  filterIndex,
  onSelect,
  onClose,
  onBack,
  withColumnItemIcon,
  withColumnGroupIcon,
  withCustomExpression,
}: FilterPickerProps) {
  const [filter, setFilter] = useState(initialFilter);
  const [column, setColumn] = useState(
    getInitialColumn(query, stageIndex, filter),
  );
  const stageIndexes = useMemo(() => [stageIndex], [stageIndex]);

  const [
    isEditingExpression,
    { open: openExpressionEditor, close: closeExpressionEditor },
  ] = useDisclosure(isExpressionEditorInitiallyOpen(query, stageIndex, filter));

  const isNewFilter = !initialFilter;

  useLayoutEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const handleChange = (filter: Lib.Filterable) => {
    onSelect(filter);
    onClose?.();
  };

  const handleBack = () => {
    setColumn(undefined);
    onBack?.();
  };

  const handleColumnSelect = (item: ColumnListItem) => {
    setColumn(item.column);
    setFilter(undefined);
  };

  const handleSegmentSelect = (item: SegmentListItem) => {
    handleChange(item.segment);
  };

  const checkItemIsSelected = useCallback(
    (item: ColumnListItem | SegmentListItem) => {
      return Boolean(
        filterIndex != null && item.filterPositions?.includes?.(filterIndex),
      );
    },
    [filterIndex],
  );

  const handleClauseChange = useCallback(
    (_name: string, clause: Lib.ExpressionClause | Lib.FilterClause) => {
      onSelect(clause);
      onClose?.();
    },
    [onSelect, onClose],
  );

  if (isEditingExpression) {
    return (
      <ExpressionWidget
        query={query}
        stageIndex={stageIndex}
        clause={filter}
        expressionMode="filter"
        header={<ExpressionWidgetHeader onBack={closeExpressionEditor} />}
        onChangeClause={handleClauseChange}
        onClose={closeExpressionEditor}
      />
    );
  }

  if (!column) {
    return (
      <FilterColumnPicker
        className={className}
        query={query}
        stageIndexes={stageIndexes}
        checkItemIsSelected={checkItemIsSelected}
        onColumnSelect={handleColumnSelect}
        onSegmentSelect={handleSegmentSelect}
        onExpressionSelect={openExpressionEditor}
        withColumnGroupIcon={withColumnGroupIcon}
        withColumnItemIcon={withColumnItemIcon}
        withCustomExpression={withCustomExpression}
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
      onBack={handleBack}
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
