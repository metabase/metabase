import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import {
  FilterColumnPicker,
  type FilterColumnPickerProps,
} from "../FilterColumnPicker";
import { FilterPickerBody } from "../FilterPickerBody";
import type {
  ColumnListItem,
  CustomListItem,
  FilterChangeOpts,
  SegmentListItem,
} from "../types";

export type MultiStageFilterPickerProps = {
  query: Lib.Query;
  canAppendStage: boolean;
  onChange: (newQuery: Lib.Query, opts: FilterChangeOpts) => void;
  onClose?: () => void;
} & Pick<FilterColumnPickerProps, "getGroupItems" | "onCustomItemSelect">;

export function MultiStageFilterPicker({
  query: initialQuery,
  canAppendStage,
  onChange,
  onClose,
  getGroupItems,
  onCustomItemSelect,
}: MultiStageFilterPickerProps) {
  const { query, stageIndexes } = useMemo(() => {
    const query = canAppendStage
      ? Lib.ensureFilterStage(initialQuery)
      : initialQuery;
    const stageIndexes = Lib.stageIndexes(query);
    return { query, stageIndexes };
  }, [initialQuery, canAppendStage]);

  const [selectedItem, setSelectedItem] = useState<ColumnListItem>();

  const handleChange = (
    filter: Lib.Filterable,
    stageIndex: number,
    opts: FilterChangeOpts,
  ) => {
    const newQuery = Lib.dropEmptyStages(Lib.filter(query, stageIndex, filter));
    onChange(newQuery, opts);
  };

  const handleFilterChange = (
    filter: Lib.ExpressionClause,
    opts: FilterChangeOpts,
  ) => {
    if (selectedItem == null) {
      return;
    }

    handleChange(filter, selectedItem.stageIndex, opts);

    if (opts.run) {
      onClose?.();
    } else {
      setSelectedItem(undefined);
    }
  };

  const handleSegmentChange = (item: SegmentListItem) => {
    handleChange(item.segment, item.stageIndex, { run: true });
    onClose?.();
  };

  // The caller applies its own entries; picking one closes the picker, as a
  // segment does.
  const handleCustomItemSelect = (item: CustomListItem) => {
    onCustomItemSelect?.(item);
    onClose?.();
  };

  const handleBack = () => {
    setSelectedItem(undefined);
  };

  if (!selectedItem) {
    return (
      <FilterColumnPicker
        query={query}
        stageIndexes={stageIndexes}
        withCustomExpression={false}
        onColumnSelect={setSelectedItem}
        onSegmentSelect={handleSegmentChange}
        getGroupItems={getGroupItems}
        onCustomItemSelect={handleCustomItemSelect}
      />
    );
  }

  return (
    <FilterPickerBody
      query={query}
      stageIndex={selectedItem.stageIndex}
      column={selectedItem.column}
      isNew
      withAddButton
      onChange={handleFilterChange}
      onBack={handleBack}
    />
  );
}
