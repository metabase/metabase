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
  metadata,
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

  const { valueCount, hasCaseSensitiveOption } = useMemo(() => {
    const option = availableOperators.find(
      option => option.operator === operatorName,
    );
    return option ?? { valueCount: 0, hasCaseSensitiveOption: false };
  }, [availableOperators, operatorName]);

  const isValid = useMemo(
    () => isFilterValid(operatorName, values),
    [operatorName, values],
  );

  const handleOperatorChange = (
    newOperatorName: Lib.StringFilterOperatorName,
  ) => {
    setOperatorName(newOperatorName);
    setValues([]);
    setOptions({});
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
    <>
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
            metadata={metadata}
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
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Footer>
    </>
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
