import { useCallback, useLayoutEffect, useState } from "react";

import { useToggle } from "metabase/hooks/use-toggle";
import type * as Lib from "metabase-lib";

import {
  FilterColumnPicker,
  type FilterColumnPickerProps,
} from "./FilterColumnPicker";
import { FilterPickerBody } from "./FilterPickerBody";
import type { ColumnListItem, SegmentListItem } from "./types";

export type FilterPickerProps = {
  className?: string;
  query: Lib.Query;
  filter?: Lib.FilterClause;
  filterIndex?: number;

  onSelect: (filter: Lib.Filterable, stageIndex: number) => void;
  onClose?: () => void;
  onBack?: () => void;
} & Pick<
  FilterColumnPickerProps,
  "withColumnItemIcon" | "withColumnGroupIcon" | "withCustomExpression"
>;

export function FilterPicker2({
  className,
  query,
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

  const [stageIndex, setStageIndex] = useState(-1);
  const [column, setColumn] = useState<Lib.ColumnMetadata | undefined>(
    undefined,
  );

  const [
    isEditingExpression,
    { turnOn: openExpressionEditor, turnOff: closeExpressionEditor },
  ] = useToggle(false);

  const isNewFilter = !initialFilter;

  useLayoutEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const handleChange = (filter: Lib.Filterable, stageIndex: number) => {
    onSelect(filter, stageIndex);
    onClose?.();
  };

  const handleBack = () => {
    setColumn(undefined);
    onBack?.();
  };

  const handleColumnSelect = (
    column: Lib.ColumnMetadata,
    stageIndex: number,
  ) => {
    setColumn(column);
    setStageIndex(stageIndex);
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

  // const handleClauseChange = useCallback(
  //   (_name: string, clause: Lib.ExpressionClause | Lib.FilterClause) => {
  //     onSelect(clause);
  //     onClose?.();
  //   },
  //   [onSelect, onClose],
  // );

  // const renderExpressionEditor = () => (
  //   <ExpressionWidget
  //     query={query}
  //     stageIndex={stageIndex}
  //     clause={filter}
  //     startRule="boolean"
  //     header={<ExpressionWidgetHeader onBack={closeExpressionEditor} />}
  //     onChangeClause={handleClauseChange}
  //     onClose={closeExpressionEditor}
  //   />
  // );

  // if (isEditingExpression) {
  //   return renderExpressionEditor();
  // }

  if (!column) {
    return (
      <FilterColumnPicker
        className={className}
        query={query}
        checkItemIsSelected={checkItemIsSelected}
        onColumnSelect={handleColumnSelect}
        onSegmentSelect={handleChange}
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
