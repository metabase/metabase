import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import { FilterColumnPicker } from "../FilterColumnPicker";
import { FilterPickerBody } from "../FilterPickerBody";
import type { ColumnListItem, SegmentListItem } from "../types";

type MultiStageFilterPickerProps = {
  query: Lib.Query;
  onChange: (newQuery: Lib.Query) => void;
  onClose?: () => void;
};

export function MultiStageFilterPicker({
  query: initialQuery,
  onChange,
  onClose,
}: MultiStageFilterPickerProps) {
  const { query, stageIndexes } = useMemo(() => {
    const query = Lib.ensureFilterStage(initialQuery);
    const stageIndexes = Lib.stageIndexes(query);
    return { query, stageIndexes };
  }, [initialQuery]);

  const [selectedItem, setSelectedItem] = useState<ColumnListItem>();

  const handleChange = (filter: Lib.Filterable, stageIndex: number) => {
    const newQuery = Lib.filter(query, stageIndex, filter);
    onChange(newQuery);
  };

  const handleFilterChange = (filter: Lib.ExpressionClause) => {
    if (selectedItem != null) {
      handleChange(filter, selectedItem.stageIndex);
      onClose?.();
    }
  };

  const handleSegmentChange = (item: SegmentListItem) => {
    handleChange(item.segment, item.stageIndex);
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
      onChange={handleFilterChange}
      onBack={handleBack}
    />
  );
}
