import { useMemo, useState } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import {
  type NumberOrEmptyValue,
  useNumberFilter,
} from "metabase/querying/filters/hooks/use-number-filter";
import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NumberFilterValuePicker } from "../../FilterValuePicker";
import { NumberFilterInput } from "../../NumberFilterInput";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { COMBOBOX_PROPS, WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";

import S from "./NumberFilterPicker.module.css";

export function NumberFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
  onChange,
  onBack,
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

  const [chevronState, setChevronState] = useState({
    leftInclusive: true,
    rightInclusive: true,
  });

  const handleChevronChange = (side: "left" | "right", value: boolean) => {
    setChevronState((prev) => ({
      ...prev,
      [side === "left" ? "leftInclusive" : "rightInclusive"]: value,
    }));
  };

  const handleOperatorChange = (newOperator: Lib.NumberFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
    if (newOperator === "between") {
      setChevronState({ leftInclusive: true, rightInclusive: true });
    }
  };

  const handleFilterChange = (opts: FilterChangeOpts) => {
    const filter = getFilterClause(operator, values);
    if (filter) {
      onChange(filter, opts);
    }
  };

  const handleFormSubmit = (event: React.FormEvent) => {
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
      data-testid="number-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOptions}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader>
      <div>
        <NumberValueInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
          chevronState={operator === "between" ? chevronState : undefined}
          onChevronChange={
            operator === "between" ? handleChevronChange : undefined
          }
        />
        <FilterPickerFooter
          isNew={isNew}
          isValid={isValid}
          withSeparator={false}
          withAddButton={withAddButton}
          onAddButtonClick={handleAddButtonClick}
        />
      </div>
    </Box>
  );
}

interface NumberValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberOrEmptyValue[]) => void;
}

const GREATER_THAN_OR_EQUAL_TO = "≥";
const GREATER_THAN = ">";
const LESS_THAN_OR_EQUAL_TO = "≤";
const LESS_THAN = "<";

function NumberValueInput({
  query,
  stageIndex,
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
  chevronState,
  onChevronChange,
}: NumberValueInputProps & {
  chevronState?: { leftInclusive: boolean; rightInclusive: boolean };
  onChevronChange?: (side: "left" | "right", value: boolean) => void;
}) {
  if (hasMultipleValues) {
    return (
      <Box p="md" mah="25vh" style={{ overflow: "auto" }}>
        <NumberFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values.filter(isNotNull)}
          autoFocus
          comboboxProps={COMBOBOX_PROPS}
          onChange={onChange}
        />
      </Box>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Enter a number`}
          autoFocus
          w="100%"
          aria-label={t`Filter value`}
          onChange={(newValue) => onChange([newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    const leftInclusive = chevronState?.leftInclusive ?? true;
    const rightInclusive = chevronState?.rightInclusive ?? true;
    return (
      <Flex direction="column" p="md" gap="md">
        <NumberFilterInput
          value={values[0]}
          w="100%"
          placeholder={t`Start of range`}
          autoFocus
          onChange={(newValue) => onChange([newValue, values[1]])}
          leftSection={
            <ToggleButton
              onClick={() => onChevronChange?.("left", !leftInclusive)}
            >
              {leftInclusive ? GREATER_THAN_OR_EQUAL_TO : GREATER_THAN}
            </ToggleButton>
          }
          classNames={{
            root: S.root,
            input: S.input,
          }}
        />
        <NumberFilterInput
          value={values[1]}
          placeholder={t`End of range`}
          onChange={(newValue) => onChange([values[0], newValue])}
          leftSection={
            <ToggleButton
              onClick={() => onChevronChange?.("right", !rightInclusive)}
            >
              {rightInclusive ? LESS_THAN_OR_EQUAL_TO : LESS_THAN}
            </ToggleButton>
          }
          classNames={{
            root: S.root,
            input: S.input,
          }}
        />
        <Text size="sm" c="text-secondary">
          {t`You can leave one of these fields blank`}
        </Text>
      </Flex>
    );
  }

  return null;
}

function ToggleButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Flex
      className={S.toggleButton}
      component="span"
      align="center"
      justify="center"
      h="100%"
      miw="40px"
      onClick={onClick}
      c="text-primary"
      fz="18px"
      aria-label="toggle greater chevron direction"
      tabIndex={0}
      role="button"
    >
      {children}
    </Flex>
  );
}
