import { useState } from "react";

import { Box, Divider, Flex, PopoverBackButton, Tabs } from "metabase/ui";

import type { DatePickerUnit, RelativeDatePickerValue } from "../types";

import { CurrentDatePicker } from "./CurrentDatePicker";
import { DateIntervalPicker } from "./DateIntervalPicker";
import { DateOffsetIntervalPicker } from "./DateOffsetIntervalPicker";
import { TabList } from "./RelativeDatePicker.styled";
import { DEFAULT_VALUE, TABS } from "./constants";
import {
  getDirection,
  isIntervalValue,
  isOffsetIntervalValue,
  setDirection,
} from "./utils";

interface RelativeDatePickerProps {
  value: RelativeDatePickerValue | undefined;
  availableUnits: ReadonlyArray<DatePickerUnit>;
  canUseRelativeOffsets: boolean;
  isNew: boolean;
  onChange: (value: RelativeDatePickerValue) => void;
  onBack: () => void;
}

export function RelativeDatePicker({
  value: initialValue,
  availableUnits,
  canUseRelativeOffsets,
  isNew,
  onChange,
  onBack,
}: RelativeDatePickerProps) {
  const [value, setValue] = useState<RelativeDatePickerValue | undefined>(
    initialValue ?? DEFAULT_VALUE,
  );
  const direction = getDirection(value);

  const handleTabChange = (tabValue: string | null) => {
    const tab = TABS.find(tab => tab.direction === tabValue);
    if (tab) {
      setValue(setDirection(value, tab.direction));
    }
  };

  const handleSubmit = () => {
    if (value != null) {
      onChange(value);
    }
  };

  return (
    <Tabs value={direction} onTabChange={handleTabChange}>
      <Flex>
        <PopoverBackButton p="sm" onClick={onBack} />
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
              availableUnits={availableUnits}
              isNew={isNew}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          ) : isIntervalValue(value) ? (
            <DateIntervalPicker
              value={value}
              availableUnits={availableUnits}
              isNew={isNew}
              canUseRelativeOffsets={canUseRelativeOffsets}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          ) : (
            <Box p="md">
              <CurrentDatePicker
                value={value}
                availableUnits={availableUnits}
                onChange={onChange}
              />
            </Box>
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
