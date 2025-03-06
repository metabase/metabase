import { Chip } from "@mantine/core";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { usePreviousDistinct } from "react-use";

import { useNumberFilter } from "metabase/querying/filters/hooks/use-number-filter";
import { Box, Flex, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterPickerFooter } from "../FilterPickerFooter";
import { WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

import { Chart } from "./Chart";
import { NumberValueInput } from "./NumberValueInput";
import { RangePicker } from "./RangePicker";

export function NumberFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onChange,
  onBack,
  clicked,
}: FilterPickerWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const {
    operator,
    availableOptions: availableOptions2,
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

  const previousOperator = usePreviousDistinct(operator);

  const availableOptions = useMemo(() => {
    return availableOptions2.sort((a, b) => {
      // if (previousOperator === 'between' && a.operator === '=') {
      //   return 0;
      // }
      // if (a.operator === "between") {
      //   return -1;
      // }
      // if (a.operator === "=") {
      //   return -1;
      // }
      if (a.operator === "between") {
        return -1;
      }

      return 0;
    });
  }, [availableOptions2, operator, previousOperator]);
  const selectedOption = availableOptions.find(
    option => option.operator === operator,
  );

  console.log({
    operator,
    previousOperator,
  });
  const handleOperatorChange = (newOperator: Lib.NumberFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const filter = getFilterClause(operator, values);
    if (filter) {
      onChange(filter);
    }
  };

  if (isOpen) {
    return (
      <Box w={WIDTH} p="md">
        <Menu>
          {availableOptions.map(option => {
            return (
              <Menu.Item
                // display={"block"}
                // w={"100%"}
                key={option.operator}
                // variant="transparent"
                // c={"#4C5773"}
                // ta={"left"}
                // style={{textAlign:'left'}}
                onClick={() => {
                  handleOperatorChange(option.operator);
                  setIsOpen(false);
                }}
              >
                {option.name}
              </Menu.Item>
            );
          })}
        </Menu>
      </Box>
    );
  }

  return (
    <Box
      component="form"
      w={WIDTH}
      data-testid="number-filter-picker"
      onSubmit={handleSubmit}
    >
      <Flex gap="sm" p="md" pb={0}>
        <Chip.Group multiple={false} value={selectedOption?.operator}>
          {availableOptions
            .filter(option => {
              if (operator === "between") {
                return option.operator === "between" || option.operator === "=";
              }

              if (previousOperator === "between" && operator === "=") {
                return option.operator === "between" || option.operator === "=";
              }

              if (operator === "=" || operator === "!=") {
                return option.operator === "=" || option.operator === "!=";
              }

              if (operator === "is-null" || operator === "not-null") {
                return (
                  option.operator === "is-null" ||
                  option.operator === "not-null"
                );
              }

              if (operator === "<" || operator === "<=") {
                return option.operator === "<" || option.operator === "<=";
              }

              if (operator === ">" || operator == ">=") {
                return option.operator === ">" || option.operator === ">=";
              }

              return true;
            })
            .slice(0, 2)
            .map(option => (
              <Chip
                radius={"xl"}
                variant={
                  selectedOption?.operator === option.operator
                    ? "filled"
                    : "outline"
                }
                value={option.operator}
                key={option.name}
                styles={
                  selectedOption?.operator === option.operator
                    ? {
                        label: {
                          // color: "#696E7B",
                          // borderColor: "#dee2e6",
                          // fontWeight: "bold",
                        },
                      }
                    : {
                        label: {
                          color: "#696E7B",
                          borderColor: "#dee2e6",
                          fontWeight: "bold",
                        },
                      }
                }
                onClick={() => handleOperatorChange(option.operator)}
              >
                {option.name}
              </Chip>
            ))}
          <Chip
            radius={"xl"}
            variant="outline"
            styles={{
              label: {
                color: "#696E7B",
                borderColor: "#dee2e6",
                fontWeight: "bold",
              },
            }}
            onClick={() => setIsOpen(true)}
          >
            ...
          </Chip>
        </Chip.Group>
      </Flex>
      {/*       <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOptions}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader> */}

      {valueCount === 2 && (
        <RangePicker
          clicked={clicked}
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          onChange={setValues}
        />
      )}

      {valueCount === 1 && (
        <Chart
          clicked={clicked}
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          onChange={setValues}
        />
      )}

      <div>
        <NumberValueInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} canSubmit={isValid} />
      </div>
    </Box>
  );
}
