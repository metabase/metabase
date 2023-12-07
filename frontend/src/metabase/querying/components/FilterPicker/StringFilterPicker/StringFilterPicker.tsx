import { useMemo } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import { Box, Checkbox, Flex, TextInput } from "metabase/ui";
import { useStringFilter } from "metabase/querying/hooks/use-string-filter";
import * as Lib from "metabase-lib";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";

const MAX_HEIGHT = 300;

export function StringFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
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
    hasCaseSensitiveOption,
    options,
    isValid,
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const filter = getFilterClause(operator, values, options);
    if (filter) {
      onChange(filter);
    }
  };

  return (
    <Box
      component="form"
      miw={MIN_WIDTH}
      maw={MAX_WIDTH}
      data-testid="string-filter-picker"
      onSubmit={handleSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOptions}
          onChange={setOperator}
        />
      </FilterPickerHeader>
      <div>
        <StringValueInput
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} canSubmit={isValid}>
          {hasCaseSensitiveOption && (
            <CaseSensitiveOption
              value={options["case-sensitive"] ?? false}
              onChange={newValue => setOptions({ "case-sensitive": newValue })}
            />
          )}
        </FilterPickerFooter>
      </div>
    </Box>
  );
}

interface StringValueInputProps {
  values: string[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: string[]) => void;
}

function StringValueInput({
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: StringValueInputProps) {
  if (hasMultipleValues) {
    return (
      <FlexWithScroll p="md" mah={MAX_HEIGHT}>
        <TextInput
          value={values[0]}
          onChange={event => onChange([event.target.value])}
          placeholder={t`Enter some text`}
          autoFocus
          w="100%"
        />
      </FlexWithScroll>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <TextInput
          value={values[0]}
          onChange={event => onChange([event.target.value])}
          placeholder={t`Enter some text`}
          autoFocus
          w="100%"
        />
      </Flex>
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
        onChange={e => onChange(e.target.checked)}
      />
    </Flex>
  );
}
