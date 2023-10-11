import { t } from "ttag";
import { useState, useMemo } from "react";
import { Box, Button, Checkbox, Flex, Select } from "metabase/ui";
import * as Lib from "metabase-lib";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import Field from "metabase-lib/metadata/Field";
import type { FilterPickerWidgetProps } from "../types";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { Footer } from "../Footer";

import { FlexWithScroll } from "../FilterPicker.styled";

import { OPTIONS } from "./constants";

export function StringFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;
  const filterParts = filter
    ? Lib.stringFilterParts(query, stageIndex, filter)
    : null;

  const availableOperators = useMemo(() => {
    const operators = Lib.filterableColumnOperators(column);
    const operatorNames = operators.map(
      operator => Lib.displayInfo(query, stageIndex, operator).shortName,
    );
    return OPTIONS.filter(option => operatorNames.includes(option.operator));
  }, [query, stageIndex, column]);

  const operatorOptions = useMemo(
    () =>
      availableOperators.map(option => ({
        label: option.name,
        value: option.operator,
      })),
    [availableOperators],
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

  const isFilterValid = useMemo(() => {
    return Number.isFinite(valueCount)
      ? values.length === valueCount
      : values.length >= 1;
  }, [values, valueCount]);

  const handleOperatorChange = (
    newOperatorName: Lib.StringFilterOperatorName,
  ) => {
    setOperatorName(newOperatorName);
    setValues([]);
    setOptions({});
  };

  const handleFilterChange = () => {
    if (operatorName && values.length) {
      onChange(
        Lib.stringFilterClause({
          operator: operatorName,
          column,
          values,
          options,
        }),
      );
    }
  };

  const placeholder = t`Enter a value`; // TODO: this logic was handled by MLv1 / TokenField

  const fieldId = useMemo(() => Lib._fieldId(column), [column]);

  const canHaveManyValues = !Number.isFinite(valueCount);

  return (
    <>
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
        <Select
          value={operatorName}
          data={operatorOptions}
          onChange={handleOperatorChange}
          withinPortal={false}
        />
      </Header>
      {valueCount > 0 && (
        <FlexWithScroll p="md" mah={300}>
          <FieldValuesWidget
            fields={[new Field({ id: fieldId })]} // TODO adapt for MLv2
            className="input"
            value={values}
            minWidth={"300px"}
            onChange={setValues}
            placeholder={placeholder}
            disablePKRemappingForSearch
            autoFocus
            multi={canHaveManyValues}
            disableSearch={!canHaveManyValues}
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
        <Button disabled={!isFilterValid} onClick={handleFilterChange}>
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
