import { t } from "ttag";
import { useState, useMemo } from "react";
import { Box, Button, Checkbox, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FilterPickerWidgetProps } from "../types";
import { getAvailableOperatorOptions } from "../utils";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { ColumnValuesWidget } from "../ColumnValuesWidget";
import { Footer } from "../Footer";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";

import { OPERATOR_OPTIONS } from "./constants";
import { isFilterValid } from "./utils";

export function StringFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;
  const filterParts = filter
    ? Lib.stringFilterParts(query, stageIndex, filter)
    : null;

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operatorName, setOperatorName] = useState(
    filterParts?.operator ?? "=",
  );

  const [values, setValues] = useState(filterParts?.values ?? []);
  const [options, setOptions] = useState(filterParts?.options ?? {});

  const { valueCount = 0, hasCaseSensitiveOption = false } =
    OPERATOR_OPTIONS[operatorName] ?? {};

  const isValid = useMemo(
    () => isFilterValid(operatorName, values),
    [operatorName, values],
  );

  const handleOperatorChange = (
    nextOperatorName: Lib.StringFilterOperatorName,
  ) => {
    const nextOption = OPERATOR_OPTIONS[nextOperatorName] ?? {};

    const nextValues = values.slice(0, nextOption.valueCount);
    const nextOptions = nextOption.hasCaseSensitiveOption ? options : {};

    setOperatorName(nextOperatorName);
    setValues(nextValues);
    setOptions(nextOptions);
  };

  const handleFilterChange = () => {
    onChange(
      Lib.stringFilterClause({
        operator: operatorName,
        column,
        values,
        options,
      }),
    );
  };

  const canHaveManyValues = !Number.isFinite(valueCount);

  return (
    <div data-testid="string-filter-picker">
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
        <FilterOperatorPicker
          value={operatorName}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </Header>
      {valueCount > 0 && (
        <FlexWithScroll p="md" mah={300}>
          <ColumnValuesWidget
            column={column}
            value={values}
            canHaveManyValues={canHaveManyValues}
            onChange={setValues}
          />
        </FlexWithScroll>
      )}
      <Footer mt={valueCount === 0 ? -1 : undefined} /* to collapse borders */>
        {hasCaseSensitiveOption ? (
          <CaseSensitiveOption
            value={options["case-sensitive"] ?? false}
            onChange={newValue => setOptions({ "case-sensitive": newValue })}
          />
        ) : (
          <Box />
        )}
        <Button
          variant="filled"
          disabled={!isValid}
          onClick={handleFilterChange}
        >
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Footer>
    </div>
  );
}

function CaseSensitiveOption({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Flex align="center" px="sm">
      <Checkbox
        onChange={e => onChange(e.target.checked)}
        checked={value}
        size="xs"
        label={t`Case sensitive`}
      />
    </Flex>
  );
}
