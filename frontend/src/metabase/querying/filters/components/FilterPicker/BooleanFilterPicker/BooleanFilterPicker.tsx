import type { FormEvent } from "react";
import { useMemo } from "react";

import { BooleanPicker } from "metabase/querying/common/components/BooleanPicker";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useBooleanFilter } from "../../../hooks/use-boolean-filter";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";

export function BooleanFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  readOnly,
  withAddButton,
  withSubmitButton,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const { value, getFilterClause, setValue } = useBooleanFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleFilterChange = (opts: FilterChangeOpts) => {
    onChange(getFilterClause(), opts);
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    handleFilterChange({ run: true });
  };

  const handleAddButtonClick = () => {
    handleFilterChange({ run: false });
  };

  return (
    <Box
      component="form"
      miw={WIDTH}
      data-testid="boolean-filter-picker"
      onSubmit={handleFormSubmit}
    >
      {onBack && (
        <FilterPickerHeader
          columnName={columnInfo.longDisplayName}
          onBack={onBack}
          readOnly={readOnly}
        />
      )}
      <BooleanPicker value={value} withEmptyOptions onChange={setValue} />
      <FilterPickerFooter
        isNew={isNew}
        isValid
        withAddButton={withAddButton}
        withSubmitButton={withSubmitButton}
        onAddButtonClick={handleAddButtonClick}
      />
    </Box>
  );
}
