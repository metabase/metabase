import { useMemo, useState } from "react";

import { Divider, Flex, PopoverBackButton, Tabs } from "metabase/ui";

import type { DatePickerOperator, SpecificDatePickerValue } from "../types";

import { DateRangePicker } from "./DateRangePicker";
import { SingleDatePicker } from "./SingleDatePicker";
import { TabList } from "./SpecificDatePicker.styled";
import {
  coerceValue,
  getDate,
  getDefaultValue,
  getTabs,
  isDateRange,
  setDate,
  setDateRange,
  setOperator,
} from "./utils";

interface SpecificDatePickerProps {
  value?: SpecificDatePickerValue;
  availableOperators: ReadonlyArray<DatePickerOperator>;
  isNew: boolean;
  onChange: (value: SpecificDatePickerValue) => void;
  onBack: () => void;
}

export function SpecificDatePicker({
  value: initialValue,
  availableOperators,
  isNew,
  onChange,
  onBack,
}: SpecificDatePickerProps) {
  const tabs = useMemo(() => {
    return getTabs(availableOperators);
  }, [availableOperators]);

  const [value, setValue] = useState(() => initialValue ?? getDefaultValue());

  const handleTabChange = (tabValue: string | null) => {
    const tab = tabs.find(tab => tab.operator === tabValue);
    if (tab) {
      setValue(setOperator(value, tab.operator));
    }
  };

  const handleDateChange = (date: Date) => {
    setValue(setDate(value, date));
  };

  const handleDateRangeChange = (dates: [Date, Date]) => {
    setValue(setDateRange(value, dates));
  };

  const handleSubmit = () => {
    onChange(coerceValue(value));
  };

  return (
    <Tabs value={value.operator} onTabChange={handleTabChange}>
      <Flex>
        <PopoverBackButton p="sm" onClick={onBack} />
        <TabList>
          {tabs.map(tab => (
            <Tabs.Tab key={tab.operator} value={tab.operator}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </TabList>
      </Flex>
      <Divider />
      {tabs.map(tab => (
        <Tabs.Panel key={tab.operator} value={tab.operator}>
          {isDateRange(value.values) ? (
            <DateRangePicker
              value={value.values}
              isNew={isNew}
              onChange={handleDateRangeChange}
              onSubmit={handleSubmit}
            />
          ) : (
            <SingleDatePicker
              value={getDate(value)}
              isNew={isNew}
              onChange={handleDateChange}
              onSubmit={handleSubmit}
            />
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
