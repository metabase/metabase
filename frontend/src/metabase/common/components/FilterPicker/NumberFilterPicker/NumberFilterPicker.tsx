import { t } from "ttag";
import { useState, useMemo } from "react";
import { Box, Button, Flex, Text, NumberInput } from "metabase/ui";
import * as Lib from "metabase-lib";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import Field from "metabase-lib/metadata/Field";
import type { FilterPickerWidgetProps } from "../types";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { Footer } from "../Footer";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";

import { isNumberFilterValid } from "./utils";
import { numberFilterValueCountMap } from "./constants";
import type { NumberFilterValueCount } from "./types";

export function NumberFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;
  const filterParts = filter
    ? Lib.numberFilterParts(query, stageIndex, filter)
    : null;

  const [operatorName, setOperatorName] =
    useState<Lib.NumberFilterOperatorName>(
      filterParts
        ? filterParts.operator
        : (Lib.defaultFilterOperatorName(
            query,
            stageIndex,
            column,
          ) as Lib.NumberFilterOperatorName),
    );

  const [values, setValues] = useState<number[]>(filterParts?.values ?? []);

  const handleOperatorChange = (
    newOperatorName: Lib.NumberFilterOperatorName,
  ) => {
    setOperatorName(newOperatorName);
    setValues([]);
  };

  const handleFilterChange = () => {
    if (operatorName && values.length) {
      onChange(
        Lib.numberFilterClause({
          operator: operatorName,
          column,
          values,
        }),
      );
    }
  };

  const valueCount = numberFilterValueCountMap[operatorName];
  const isFilterValid = isNumberFilterValid(operatorName, values);

  return (
    <>
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
        <FilterOperatorPicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          value={operatorName}
          onChange={newOperator =>
            handleOperatorChange(newOperator as Lib.NumberFilterOperatorName)
          }
        />
      </Header>
      <NumberValueInput
        values={values}
        onChange={setValues}
        valueCount={valueCount ?? 0}
        column={column}
      />
      <Footer mt={valueCount === 0 ? -1 : undefined} /* to collapse borders */>
        <Box />
        <Button disabled={!isFilterValid} onClick={handleFilterChange}>
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Footer>
    </>
  );
}

function NumberValueInput({
  values,
  onChange,
  valueCount,
  column,
}: {
  values: number[];
  onChange: (values: number[]) => void;
  valueCount: NumberFilterValueCount;
  column: Lib.ColumnMetadata;
}) {
  const placeholder = t`Enter a number`;
  const fieldId = useMemo(() => Lib._fieldId(column), [column]);

  // const prefix = '$'; TODO

  switch (valueCount) {
    case "multiple":
      return (
        <FlexWithScroll p="md" mah={300}>
          <FieldValuesWidget
            fields={[new Field({ id: fieldId })]} // TODO adapt for MLv2
            className="input"
            value={values}
            minWidth={"300px"}
            onChange={onChange}
            placeholder={placeholder}
            disablePKRemappingForSearch
            autoFocus
            disableSearch
            multi={valueCount === "multiple"}
          />
        </FlexWithScroll>
      );
    case 1:
      return (
        <Flex p="md">
          <NumberInput
            value={values[0]}
            onChange={(newValue: number) => onChange([newValue])}
            placeholder={placeholder}
            autoFocus
            w="100%"
          />
        </Flex>
      );
    case 2:
      return (
        <Flex align="center" justify="center" p="md">
          <NumberInput
            value={values[0]}
            onChange={(newValue: number) => onChange([newValue, values[1]])}
            placeholder={placeholder}
            autoFocus
          />
          <Text mx="sm">{t`and`}</Text>
          <NumberInput
            value={values[1]}
            onChange={(newValue: number) => onChange([values[0], newValue])}
            placeholder={placeholder}
          />
        </Flex>
      );
    default:
      return null;
  }
}
