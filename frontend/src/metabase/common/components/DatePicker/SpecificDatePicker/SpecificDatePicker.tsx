import { useState } from "react";
import { Group, Tabs } from "metabase/ui";
import { BackButton } from "../BackButton";
import type { DatePickerOperator, SpecificDatePickerValue } from "../types";
import { getDefaultValue, getTabs, setOperator } from "./utils";
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
  const [value, setValue] = useState(initialValue ?? getDefaultValue());
  const tabs = getTabs(availableOperators);

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
      <Group>
        <BackButton onClick={onBack} />
        <TabList>
          {tabs.map(tab => (
            <Tabs.Tab key={tab.operator} value={tab.operator}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </TabList>
      </Group>
      {tabs.map(tab => (
        <Tabs.Panel key={tab.operator} value={tab.operator}>
          <SingleDatePicker
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
          />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

interface SingleDatePickerProps {
  value: SpecificDatePickerValue;
  onChange: (value: SpecificDatePickerValue) => void;
  onSubmit: () => void;
}

function SingleDatePicker({
  value,
  onChange,
  onSubmit,
}: SingleDatePickerProps) {
  return <div />;
}
