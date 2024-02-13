import { useState } from "react";
import { Divider, Flex, Tabs } from "metabase/ui";
import { BackButton } from "../BackButton";
import type { RelativeDatePickerValue } from "../types";
import { DEFAULT_VALUE, TABS } from "./constants";
import {
  getDirection,
  isIntervalValue,
  isOffsetIntervalValue,
  setDirection,
} from "./utils";
import { CurrentDatePicker } from "./CurrentDatePicker";
import { DateIntervalPicker } from "./DateIntervalPicker";
import { DateOffsetIntervalPicker } from "./DateOffsetIntervalPicker";
import { TabList } from "./RelativeDatePicker.styled";

interface RelativeDatePickerProps {
  value: RelativeDatePickerValue | undefined;
  canUseRelativeOffsets: boolean;
  isNew: boolean;
  onChange: (value: RelativeDatePickerValue) => void;
  onBack: () => void;
}

export function RelativeDatePicker({
  value: initialValue,
  canUseRelativeOffsets,
  isNew,
  onChange,
  onBack,
}: RelativeDatePickerProps) {
  const [value, setValue] = useState(initialValue ?? DEFAULT_VALUE);
  const direction = getDirection(value);

  const handleTabChange = (tabValue: string | null) => {
    const tab = TABS.find(tab => tab.direction === tabValue);
    if (tab) {
      setValue(setDirection(value, tab.direction));
    }
  };

  const handleSubmit = () => {
    onChange(value);
  };

  return (
    <Tabs value={direction} onTabChange={handleTabChange}>
      <Flex>
        <BackButton onClick={onBack} />
        <TabList>
          {TABS.map(tab => (
            <Tabs.Tab key={tab.direction} value={tab.direction}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </TabList>
      </Flex>
      <Divider />
      {TABS.map(tab => (
        <Tabs.Panel key={tab.direction} value={tab.direction}>
          {isOffsetIntervalValue(value) ? (
            <DateOffsetIntervalPicker
              value={value}
              isNew={isNew}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          ) : isIntervalValue(value) ? (
            <DateIntervalPicker
              value={value}
              isNew={isNew}
              canUseRelativeOffsets={canUseRelativeOffsets}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          ) : (
            <CurrentDatePicker value={value} onChange={onChange} />
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
