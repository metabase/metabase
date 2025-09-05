import { type ReactNode, useMemo, useState } from "react";

import type {
  DatePickerOperator,
  DatePickerUnit,
  SpecificDatePickerValue,
} from "metabase/querying/filters/types";
import { Divider, Flex, PopoverBackButton, Tabs } from "metabase/ui";

import type { DatePickerSubmitButtonProps } from "../types";
import { renderDefaultSubmitButton } from "../utils";

import { DateRangePicker, type DateRangePickerValue } from "./DateRangePicker";
import {
  SingleDatePicker,
  type SingleDatePickerValue,
} from "./SingleDatePicker";
import S from "./SpecificDatePicker.module.css";
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
  availableOperators: DatePickerOperator[];
  availableUnits: DatePickerUnit[];
  renderSubmitButton?: (props: DatePickerSubmitButtonProps) => ReactNode;
  onChange: (value: SpecificDatePickerValue) => void;
  onBack: () => void;
  readOnly?: boolean;
}

export function SpecificDatePicker({
  value: initialValue,
  availableOperators,
  availableUnits,
  renderSubmitButton = renderDefaultSubmitButton,
  onChange,
  onBack,
  readOnly,
}: SpecificDatePickerProps) {
  const tabs = useMemo(() => getTabs(availableOperators), [availableOperators]);
  const [value, setValue] = useState(() => initialValue ?? getDefaultValue());
  const hasTimeToggle = canSetTime(value, availableUnits);
  const coercedValue = coerceValue(value);

  const handleTabChange = (tabValue: string | null) => {
    const tab = tabs.find((tab) => tab.operator === tabValue);
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
    onChange(coercedValue);
  };

  return (
    <Tabs value={value.operator} onChange={handleTabChange}>
      <Flex>
        <PopoverBackButton
          p="sm"
          onClick={onBack}
          disabled={readOnly}
          withArrow={!readOnly}
        />
        <Tabs.List className={S.TabList}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.operator} value={tab.operator}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Flex>
      <Divider />
      {tabs.map((tab) => (
        <Tabs.Panel key={tab.operator} value={tab.operator}>
          {isDateRange(value.values) ? (
            <DateRangePicker
              value={{ dateRange: value.values, hasTime: value.hasTime }}
              hasTimeToggle={hasTimeToggle}
              renderSubmitButton={() =>
                renderSubmitButton({ value: coercedValue })
              }
              onChange={handleDateRangeChange}
              onSubmit={handleSubmit}
            />
          ) : (
            <SingleDatePicker
              value={{ date: getDate(value), hasTime: value.hasTime }}
              hasTimeToggle={hasTimeToggle}
              renderSubmitButton={() =>
                renderSubmitButton({ value: coercedValue })
              }
              onChange={handleDateChange}
              onSubmit={handleSubmit}
            />
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
