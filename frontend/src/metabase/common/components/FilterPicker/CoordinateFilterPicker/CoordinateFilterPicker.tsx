import { t } from "ttag";
import { useState, useMemo } from "react";
import { Box, Button, Flex, Text, NumberInput, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import Field from "metabase-lib/metadata/Field";
import type { FilterPickerWidgetProps } from "../types";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { Footer } from "../Footer";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";

import { CoordinateColumnSelect } from "./CoordinateColumnSelect";

import { findSecondColumn, isCoordinateFilterValid } from "./utils";

import { coordinateFilterValueCountMap } from "./constants";
import type { CoordinateFilterValueCount } from "./types";

export function CoordinateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;
  const filterParts = filter
    ? Lib.coordinateFilterParts(query, stageIndex, filter)
    : null;

  const [operatorName, setOperatorName] =
    useState<Lib.CoordinateFilterOperatorName>(
      filterParts
        ? filterParts.operator
        : (Lib.defaultFilterOperatorName(
            query,
            stageIndex,
            column,
          ) as Lib.CoordinateFilterOperatorName),
    );

  const [values, setValues] = useState<number[]>(filterParts?.values ?? []);

  const [column2, setColumn2] = useState<Lib.ColumnMetadata | null>(
    findSecondColumn({ query, stageIndex, column, filter, operatorName }),
  );

  const handleOperatorChange = (
    newOperatorName: Lib.CoordinateFilterOperatorName,
  ) => {
    setOperatorName(newOperatorName);
    setValues([]);
    setColumn2(
      findSecondColumn({
        query,
        stageIndex,
        column,
        filter,
        operatorName: newOperatorName,
      }),
    );
  };

  const handleFilterChange = () => {
    if (operatorName && values.length) {
      if (operatorName === "inside" && column2) {
        const [latitudeColumn, longitudeColumn] = Lib.isLatitude(column)
          ? [column, column2]
          : [column2, column];

        onChange(
          Lib.coordinateFilterClause({
            operator: operatorName,
            column: latitudeColumn,
            longitudeColumn,
            values,
          }),
        );
      } else {
        onChange(
          Lib.coordinateFilterClause({
            operator: operatorName,
            column,
            values,
          }),
        );
      }
    }
  };

  const valueCount = coordinateFilterValueCountMap[operatorName];
  const isFilterValid = isCoordinateFilterValid(operatorName, values);

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
            handleOperatorChange(
              newOperator as Lib.CoordinateFilterOperatorName,
            )
          }
        />
      </Header>
      {operatorName === "inside" && (
        <CoordinateColumnSelect
          query={query}
          stageIndex={stageIndex}
          column={column}
          value={column2}
          onChange={(newCol2: Lib.ColumnMetadata) => setColumn2(newCol2)}
        />
      )}
      <CoordinateValueInput
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

function CoordinateValueInput({
  values,
  onChange,
  valueCount,
  column,
}: {
  values: number[];
  onChange: (values: number[]) => void;
  valueCount: CoordinateFilterValueCount;
  column: Lib.ColumnMetadata;
}) {
  const placeholder = t`Enter a number`;
  const fieldId = useMemo(() => Lib._fieldId(column), [column]);

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
    case 4:
      return (
        <Stack align="center" justify="center" spacing="sm" p="md">
          <NumberInput
            label={t`Upper latitude`}
            value={values[0]}
            onChange={(newValue: number) =>
              onChange([newValue, values[1], values[2], values[3]])
            }
            placeholder="90"
            autoFocus
          />
          <Flex align="center" justify="center" gap="sm">
            <NumberInput
              label={t`Left longitude`}
              value={values[1]}
              onChange={(newValue: number) =>
                onChange([values[0], newValue, values[2], values[3]])
              }
              placeholder="-180"
            />
            <NumberInput
              label={t`Right longitude`}
              value={values[3]}
              onChange={(newValue: number) =>
                onChange([values[0], values[1], values[2], newValue])
              }
              placeholder="180"
            />
          </Flex>
          <NumberInput
            label={t`Lower latitude`}
            value={values[2]}
            onChange={(newValue: number) =>
              onChange([values[0], values[1], newValue, values[3]])
            }
            placeholder="-90"
          />
        </Stack>
      );
    default:
      return null;
  }
}
