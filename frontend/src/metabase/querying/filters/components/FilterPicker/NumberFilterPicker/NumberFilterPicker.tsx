import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { BigIntNumberInput } from "metabase/querying/common/components/BigIntNumberInput";
import { Box, Flex, NumberInput, Text } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { NumberFilterValuePicker } from "../FilterValuePicker";
import { COMBOBOX_PROPS, WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";
import { useReportDraftFilter } from "../use-report-draft-filter";

import { HistogramSlider, getHistogramWidth } from "./HistogramSlider";
import {
  BUCKET_COUNT,
  NumberColumnStats,
  type NumberColumnStatsResult,
  useNumberColumnStats,
} from "./NumberColumnStats";
import S from "./NumberFilterPicker.module.css";
import { type NumberOrEmptyValue, useNumberFilter } from "./hooks";

export function NumberFilterPicker({
  autoFocus,
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
  withSubmitButton,
  onChange,
  onDraftChange,
  onBack,
  readOnly,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useNumberFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  useReportDraftFilter(onDraftChange, { operator, values }, () =>
    isValid ? getFilterClause(operator, values) : undefined,
  );

  const { isFast, result: columnStats } = useNumberColumnStats({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.NumberFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleFilterChange = (opts: FilterChangeOpts) => {
    const filter = getFilterClause(operator, values);
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
      // Prototype: the histogram has a fixed width, and the popover grows to it.
      w={isFast ? Math.max(WIDTH, getHistogramWidth(BUCKET_COUNT) + 48) : WIDTH}
      data-testid="number-filter-picker"
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
        <NumberValueInput
          autoFocus={autoFocus}
          query={query}
          stageIndex={stageIndex}
          column={column}
          operator={operator}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          columnStats={columnStats}
          onChange={setValues}
        />
        {columnStats != null && <NumberColumnStats stats={columnStats.stats} />}
        <FilterPickerFooter
          isNew={isNew}
          isValid={isValid}
          withAddButton={withAddButton}
          withSubmitButton={withSubmitButton}
          onAddButtonClick={handleAddButtonClick}
        />
      </div>
    </Box>
  );
}

interface NumberValueInputProps {
  autoFocus: boolean;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  operator: Lib.NumberFilterOperator;
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  columnStats: NumberColumnStatsResult | null;
  onChange: (values: NumberOrEmptyValue[]) => void;
}

function NumberValueInput({
  autoFocus,
  query,
  stageIndex,
  column,
  operator,
  values,
  valueCount,
  hasMultipleValues,
  columnStats,
  onChange,
}: NumberValueInputProps) {
  const inputCount = hasMultipleValues ? 1 : valueCount;
  if (
    columnStats != null &&
    inputCount > 0 &&
    (!hasMultipleValues || values.length <= 1)
  ) {
    return (
      <SliderValueInput
        autoFocus={autoFocus}
        operator={operator}
        values={values}
        inputCount={inputCount}
        histogram={columnStats.histogram}
        min={columnStats.range.min}
        max={columnStats.range.max}
        step={columnStats.step}
        onChange={onChange}
      />
    );
  }

  if (hasMultipleValues) {
    return (
      <Box px="xl" pt="md" pb="md">
        <NumberFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values.filter(isNotNull)}
          autoFocus={autoFocus}
          comboboxProps={COMBOBOX_PROPS}
          onChange={onChange}
        />
      </Box>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex px="xl" py="lg">
        <BigIntNumberInput
          value={values[0]}
          placeholder={t`Enter a number`}
          autoFocus={autoFocus}
          w="100%"
          aria-label={t`Filter value`}
          onChange={(newValue) => onChange([newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center" justify="center" px="xl" py="lg">
        <BigIntNumberInput
          value={values[0]}
          placeholder={t`Min`}
          autoFocus={autoFocus}
          onChange={(newValue) => onChange([newValue, values[1]])}
        />
        <Text mx="sm">{t`and`}</Text>
        <BigIntNumberInput
          value={values[1]}
          placeholder={t`Max`}
          onChange={(newValue) => onChange([values[0], newValue])}
        />
      </Flex>
    );
  }

  return null;
}

interface SliderValueInputProps {
  autoFocus: boolean;
  operator: Lib.NumberFilterOperator;
  values: NumberOrEmptyValue[];
  inputCount: number;
  histogram: number[];
  min: number;
  max: number;
  step: number;
  onChange: (values: NumberOrEmptyValue[]) => void;
}

// Prototype: number inputs with a histogram slider, for the fast tables of the
// prototype dataset only.
function SliderValueInput({
  autoFocus,
  operator,
  values,
  inputCount,
  histogram,
  min,
  max,
  step,
  onChange,
}: SliderValueInputProps) {
  const numberValues = Array.from({ length: inputCount }, (_, index) =>
    toNumber(values[index]),
  );

  const handleInputChange = (index: number, value: number | string) => {
    const newValues: NumberOrEmptyValue[] = [...numberValues];
    newValues[index] = fromInputValue(value);
    onChange(newValues);
  };

  return (
    <Box px="xl" pt="md" pb="xl">
      <Flex align="center">
        <NumberInput
          value={numberValues[0] ?? ""}
          placeholder={inputCount === 2 ? t`Min` : t`Enter a number`}
          autoFocus={autoFocus}
          size="xs"
          hideControls={false}
          classNames={{ input: S.input }}
          flex={1}
          aria-label={t`Filter value`}
          onChange={(value) => handleInputChange(0, value)}
        />
        {inputCount === 2 && (
          <>
            <Text mx="md">{t`and`}</Text>
            <NumberInput
              value={numberValues[1] ?? ""}
              placeholder={t`Max`}
              size="xs"
              hideControls={false}
              classNames={{ input: S.input }}
              flex={1}
              onChange={(value) => handleInputChange(1, value)}
            />
          </>
        )}
      </Flex>
      <Box mt="xxl">
        <HistogramSlider
          operator={operator}
          histogram={histogram}
          min={min}
          max={max}
          step={step}
          values={numberValues}
          onChange={onChange}
        />
      </Box>
    </Box>
  );
}

function toNumber(value: NumberOrEmptyValue | undefined): number | null {
  return value != null ? Number(value) : null;
}

function fromInputValue(value: number | string): number | null {
  if (typeof value === "number") {
    return value;
  }
  const number = value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}
