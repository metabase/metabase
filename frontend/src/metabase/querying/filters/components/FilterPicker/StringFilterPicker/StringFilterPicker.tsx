import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { FilterOperatorPicker } from "metabase/querying/filters/components/FilterPicker/FilterOperatorPicker";
import { FilterPickerFooter } from "metabase/querying/filters/components/FilterPicker/FilterPickerFooter";
import { FilterPickerHeader } from "metabase/querying/filters/components/FilterPicker/FilterPickerHeader";
import { StringFilterValuePicker } from "metabase/querying/filters/components/FilterPicker/FilterValuePicker";
import {
  COMBOBOX_PROPS,
  WIDTH,
} from "metabase/querying/filters/components/FilterPicker/constants";
import type {
  FilterChangeOpts,
  FilterPickerWidgetProps,
} from "metabase/querying/filters/components/FilterPicker/types";
import {
  type OperatorType,
  useStringFilter,
} from "metabase/querying/filters/hooks/use-string-filter";
import { Box, Checkbox, Flex, MultiAutocomplete } from "metabase/ui";
import * as Lib from "metabase-lib";

export function StringFilterPicker({
  autoFocus,
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
  withSubmitButton,
  onChange,
  onBack,
  readOnly,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const {
    type,
    operator,
    availableOptions,
    values,
    options,
    isValid,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
    setOptions,
  } = useStringFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.StringFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleFilterChange = (opts: FilterChangeOpts) => {
    const filter = getFilterClause(operator, values, options);
    if (filter) {
      onChange(filter, opts);
    }
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
      w={WIDTH}
      data-testid="string-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
        readOnly={readOnly}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOptions}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader>
      <div>
        <StringValueInput
          autoFocus={autoFocus}
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          type={type}
          onChange={setValues}
        />
        <FilterPickerFooter
          isNew={isNew}
          isValid={isValid}
          withAddButton={withAddButton}
          withSubmitButton={withSubmitButton}
          onAddButtonClick={handleAddButtonClick}
        >
          {type === "partial" && (
            <CaseSensitiveOption
              value={options.caseSensitive ?? false}
              onChange={(newValue) => setOptions({ caseSensitive: newValue })}
            />
          )}
        </FilterPickerFooter>
      </div>
    </Box>
  );
}

interface StringValueInputProps {
  autoFocus: boolean;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: string[];
  type: OperatorType;
  onChange: (values: string[]) => void;
}

function StringValueInput({
  autoFocus,
  query,
  stageIndex,
  column,
  values,
  type,
  onChange,
}: StringValueInputProps) {
  if (type === "exact") {
    return (
      <Box p="md" pb={0} mah="25vh" style={{ overflow: "auto" }}>
        <StringFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          comboboxProps={COMBOBOX_PROPS}
          autoFocus={autoFocus}
          onChange={onChange}
        />
        <Box pt="md" />
      </Box>
    );
  }

  if (type === "partial") {
    return (
      <Box p="md" pb={0} mah="40vh" style={{ overflow: "auto" }}>
        <MultiAutocomplete
          value={values}
          placeholder={t`Enter some text`}
          comboboxProps={COMBOBOX_PROPS}
          aria-label={t`Filter value`}
          onChange={onChange}
        />
        <Box pt="md" />
      </Box>
    );
  }

  return null;
}

interface CaseSensitiveOptionProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

function CaseSensitiveOption({ value, onChange }: CaseSensitiveOptionProps) {
  return (
    <Flex align="center" px="sm">
      <Checkbox
        size="xs"
        label={t`Case sensitive`}
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Flex>
  );
}
