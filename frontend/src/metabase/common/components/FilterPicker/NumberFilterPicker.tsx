import { t } from "ttag";
import { useState, useMemo } from "react";
import { Box, Button, Flex, Text, NumberInput } from "metabase/ui";
import * as Lib from "metabase-lib";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import Field from "metabase-lib/metadata/Field";
import type { FilterPickerWidgetProps } from "./types";
import { BackButton } from "./BackButton";
import { Header } from "./Header";
import { Footer } from "./Footer";

import { FilterOperatorPicker } from "./FilterOperatorPicker";

const numberValueTypes = ["single", "multiple", "two", "none"];
type NumberValueType = typeof numberValueTypes[number];

const operatorTypes: Record<NumberValueType, Lib.FilterOperatorName[]> = {
  single: [">", ">=", "<", "<="],
  multiple: ["=", "!="],
  two: ["between"],
  none: ["is-null", "not-null", "is-empty", "not-empty"],
};

export function NumberFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
  onChange,
  onClose,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;
  const filterParts = filter
    ? Lib.numberFilterParts(query, stageIndex, filter)
    : null;

  const [operatorName, setOperatorName] =
    useState<Lib.FilterOperatorName | null>(
      filterParts
        ? Lib.displayInfo(query, stageIndex, filterParts.operator).shortName
        : "=",
    );

  const [values, setValues] = useState<number[]>(filterParts?.values ?? []);

  const handleOperatorChange = (newOperatorName: Lib.FilterOperatorName) => {
    setOperatorName(newOperatorName);
    setValues([]);
  };

  const handleValuesChange = (values: number[]) => {
    setValues(values);
  };

  const handleFilterChange = () => {
    if (operatorName && values.length) {
      const operator = Lib.findFilterOperator(
        query,
        stageIndex,
        column,
        operatorName,
      );
      if (operator) {
        onChange(
          Lib.numberFilterClause(query, stageIndex, {
            operator,
            column,
            values,
          }),
        );
        onClose();
      }
    }
  };

  const numberValueType = getNumberValueType(operatorName);
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
          onChange={handleOperatorChange}
        />
      </Header>
      <NumberValueInput
        values={values}
        onChange={handleValuesChange}
        type={numberValueType}
        column={column}
      />
      <Footer
        mt={
          numberValueType === "none" ? -1 : undefined
        } /* to collapse borders */
      >
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
  type,
  column,
}: {
  values: number[];
  onChange: (values: number[]) => void;
  type: NumberValueType;
  column: Lib.ColumnMetadata;
}) {
  const placeHolder = t`Enter a number`;
  const fieldId = useMemo(() => Lib._fieldId(column), [column]);

  // const prefix = '$'; TODO

  switch (type) {
    case "multiple":
      return (
        <Flex p="md" mah={300} style={{ overflowY: "scroll" }}>
          <FieldValuesWidget
            fields={[new Field({ id: fieldId })]}
            className="input"
            value={values}
            minWidth={"300px"}
            onChange={onChange}
            placeholder={placeHolder}
            disablePKRemappingForSearch
            autoFocus
            multi={type === "multiple"}
          />
        </Flex>
      );
    case "single":
      return (
        <Flex p="md">
          <NumberInput
            value={values[0]}
            onChange={(newValue: number) => onChange([newValue])}
            placeholder={placeHolder}
            autoFocus
          />
        </Flex>
      );
    case "two":
      return (
        <Flex align="center" justify="center" p="md">
          <NumberInput
            value={values[0]}
            onChange={(newValue: number) => onChange([newValue, values[1]])}
            placeholder={placeHolder}
            autoFocus
          />
          <Text mx="sm">{t`and`}</Text>
          <NumberInput
            value={values[1]}
            onChange={(newValue: number) => onChange([values[0], newValue])}
            placeholder={placeHolder}
          />
        </Flex>
      );
    default:
      return null;
  }
}

function getNumberValueType(
  operatorName: Lib.FilterOperatorName | null,
): NumberValueType {
  if (!operatorName) {
    return "none";
  }

  const valueInputType = numberValueTypes.find(type => {
    if (operatorTypes[type].includes(operatorName)) {
      return type;
    }
  });

  return valueInputType ?? "none";
}

function isNumberFilterValid(
  operatorName: Lib.FilterOperatorName | null,
  values: number[],
): boolean {
  if (!operatorName) {
    return false;
  }

  switch (getNumberValueType(operatorName)) {
    case "multiple":
      return values.length >= 1;
    case "single":
      return values.length === 1;
    case "two":
      return values.length === 2;
    case "none":
      return values.length === 0;
  }

  return false;
}
