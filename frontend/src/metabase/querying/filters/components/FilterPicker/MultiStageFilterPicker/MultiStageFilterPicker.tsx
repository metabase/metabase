import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import { FilterColumnPicker } from "../FilterColumnPicker";
import { FilterPickerBody } from "../FilterPickerBody";
import type {
  ColumnListItem,
  FilterChangeOpts,
  SegmentListItem,
} from "../types";

export type MultiStageFilterPickerProps = {
  query: Lib.Query;
  canAppendStage: boolean;
  onChange: (newQuery: Lib.Query, opts: FilterChangeOpts) => void;
  onClose?: () => void;
};

export function MultiStageFilterPicker({
  query: initialQuery,
  canAppendStage,
  onChange,
  onClose,
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
    const newQuery = Lib.filter(query, stageIndex, filter);
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
