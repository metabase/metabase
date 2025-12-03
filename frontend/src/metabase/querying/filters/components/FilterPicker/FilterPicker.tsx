import { useDisclosure } from "@mantine/hooks";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import {
  ExpressionWidget,
  ExpressionWidgetHeader,
} from "metabase/query_builder/components/expressions";
import type { DefinedClauseName } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import {
  FilterColumnPicker,
  type FilterColumnPickerProps,
} from "./FilterColumnPicker";
import { FilterPickerBody } from "./FilterPickerBody";
import type {
  ColumnListItem,
  ExpressionClauseItem,
  SegmentListItem,
} from "./types";

export type FilterPickerProps = {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  filterIndex?: number;

  onSelect: (filter: Lib.Filterable) => void;
  onClose?: () => void;
  onBack?: () => void;
  readOnly?: boolean;
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
  readOnly,
}: FilterPickerProps) {
  const [filter, setFilter] = useState(initialFilter);
  const [column, setColumn] = useState(
    getInitialColumn(query, stageIndex, filter),
  );
  const stageIndexes = useMemo(() => [stageIndex], [stageIndex]);
  const [initialExpressionClause, setInitialExpressionClause] =
    useState<DefinedClauseName | null>(null);
  const availableColumns = useMemo(
    () => Lib.expressionableColumns(query, stageIndex),
    [query, stageIndex],
  );

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

  const handleExpressionSelect = (clause?: DefinedClauseName) => {
    setInitialExpressionClause(clause ?? null);
    openExpressionEditor();
  };

  const checkItemIsSelected = useCallback(
    (item: ColumnListItem | SegmentListItem | ExpressionClauseItem) => {
      return Boolean(
        filterIndex != null &&
          "filterPositions" in item &&
          item.filterPositions?.includes?.(filterIndex),
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
        availableColumns={availableColumns}
        clause={filter}
        expressionMode="filter"
        header={<ExpressionWidgetHeader onBack={closeExpressionEditor} />}
        onChangeClause={handleClauseChange}
        onClose={closeExpressionEditor}
        initialExpressionClause={initialExpressionClause}
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
        onExpressionSelect={handleExpressionSelect}
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
      readOnly={readOnly}
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
