import { useMemo, useState } from "react";
import { Divider, Flex, Tabs } from "metabase/ui";
import { BackButton } from "../BackButton";
import type { DatePickerOperator, SpecificDatePickerValue } from "../types";
import { SingleDatePicker } from "./SingleDatePicker";
import { DateRangePicker } from "./DateRangePicker";
import { getDefaultValue, getTabs, isDateRange, setOperator } from "./utils";
import { TabList } from "./SpecificDatePicker.styled";

export interface SpecificDatePickerProps {
  value?: SpecificDatePickerValue;
  availableOperators: ReadonlyArray<DatePickerOperator>;
  onChange: (value: SpecificDatePickerValue) => void;
  onBack: () => void;
}

export function SpecificDatePicker({
  value: initialValue,
  availableOperators,
  onChange,
  onBack,
}: SpecificDatePickerProps) {
  const tabs = useMemo(() => {
    return getTabs(availableOperators);
  }, [availableOperators]);

  const [value, setValue] = useState(() => initialValue ?? getDefaultValue());
  const isNew = initialValue == null;

  const handleTabChange = (tabValue: string | null) => {
    const tab = tabs.find(tab => tab.operator === tabValue);
    if (tab) {
      setValue(setOperator(value, tab.operator));
    }
  };

  const handleSubmit = () => {
    onChange(value);
  };

  return (
    <Tabs value={value.operator} onTabChange={handleTabChange}>
      <Flex>
        <BackButton onClick={onBack} />
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
          {isDateRange(value) ? (
            <DateRangePicker
              value={value}
              isNew={isNew}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          ) : (
            <SingleDatePicker
              value={value}
              isNew={isNew}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
