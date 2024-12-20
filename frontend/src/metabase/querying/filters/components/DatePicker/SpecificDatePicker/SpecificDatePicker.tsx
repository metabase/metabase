import { useMemo, useState } from "react";

import { Divider, Flex, PopoverBackButton, Tabs } from "metabase/ui";

import type {
  DatePickerOperator,
  DatePickerUnit,
  SpecificDatePickerValue,
} from "../types";

import { DateRangePicker, type DateRangePickerValue } from "./DateRangePicker";
import {
  SingleDatePicker,
  type SingleDatePickerValue,
} from "./SingleDatePicker";
import S from "./SpecificDatePicker.modules.css";
import {
  canSetTime,
  coerceValue,
  getDate,
  getDefaultValue,
  getTabs,
  isDateRange,
  setDateTime,
  setDateTimeRange,
  setOperator,
} from "./utils";

interface SpecificDatePickerProps {
  value?: SpecificDatePickerValue;
  availableOperators: ReadonlyArray<DatePickerOperator>;
  availableUnits: ReadonlyArray<DatePickerUnit>;
  isNew: boolean;
  onChange: (value: SpecificDatePickerValue) => void;
  onBack: () => void;
}

export function SpecificDatePicker({
  value: initialValue,
  availableOperators,
  availableUnits,
  isNew,
  onChange,
  onBack,
}: SpecificDatePickerProps) {
  const tabs = useMemo(() => getTabs(availableOperators), [availableOperators]);
  const [value, setValue] = useState(() => initialValue ?? getDefaultValue());
  const hasTimeToggle = canSetTime(value, availableUnits);

  const handleTabChange = (tabValue: string | null) => {
    const tab = tabs.find(tab => tab.operator === tabValue);
    if (tab) {
      setValue(setOperator(value, tab.operator));
    }
  };

  const handleDateChange = ({ date, hasTime }: SingleDatePickerValue) => {
    setValue(setDateTime(value, date, hasTime));
  };

  const handleDateRangeChange = ({
    dateRange,
    hasTime,
  }: DateRangePickerValue) => {
    setValue(setDateTimeRange(value, dateRange, hasTime));
  };

  const handleSubmit = () => {
    onChange(coerceValue(value));
  };

  return (
    <Tabs value={value.operator} onTabChange={handleTabChange}>
      <Flex>
        <PopoverBackButton p="sm" onClick={onBack} />
        <Tabs.List className={S.TabList}>
          {tabs.map(tab => (
            <Tabs.Tab key={tab.operator} value={tab.operator}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Flex>
      <Divider />
      {tabs.map(tab => (
        <Tabs.Panel key={tab.operator} value={tab.operator}>
          {isDateRange(value.values) ? (
            <DateRangePicker
              value={{ dateRange: value.values, hasTime: value.hasTime }}
              isNew={isNew}
              hasTimeToggle={hasTimeToggle}
              onChange={handleDateRangeChange}
              onSubmit={handleSubmit}
            />
          ) : (
            <SingleDatePicker
              value={{ date: getDate(value), hasTime: value.hasTime }}
              isNew={isNew}
              hasTimeToggle={hasTimeToggle}
              onChange={handleDateChange}
              onSubmit={handleSubmit}
            />
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
