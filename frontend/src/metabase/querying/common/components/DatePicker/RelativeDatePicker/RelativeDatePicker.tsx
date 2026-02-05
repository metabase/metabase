import { type ReactNode, useState } from "react";

import type {
  DatePickerUnit,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";
import { Box, Divider, Flex, PopoverBackButton, Tabs } from "metabase/ui";

import type { DatePickerSubmitButtonProps } from "../types";
import { renderDefaultSubmitButton } from "../utils";

import { CurrentDatePicker } from "./CurrentDatePicker";
import { DateIntervalPicker } from "./DateIntervalPicker";
import { DateOffsetIntervalPicker } from "./DateOffsetIntervalPicker";
import S from "./RelativeDatePicker.module.css";
import {
  getAvailableTabs,
  getDefaultValue,
  getDirection,
  isIntervalValue,
  isOffsetIntervalValue,
  setDirection,
} from "./utils";

interface RelativeDatePickerProps {
  value: RelativeDatePickerValue | undefined;
  availableUnits: DatePickerUnit[];
  availableDirections: RelativeIntervalDirection[];
  renderSubmitButton?: (props: DatePickerSubmitButtonProps) => ReactNode;
  onChange: (value: RelativeDatePickerValue) => void;
  onBack: () => void;
  readOnly?: boolean;
}

export function RelativeDatePicker({
  value: initialValue,
  availableUnits,
  availableDirections,
  renderSubmitButton = renderDefaultSubmitButton,
  onChange,
  onBack,
  readOnly,
}: RelativeDatePickerProps) {
  const [value, setValue] = useState(
    initialValue ?? getDefaultValue(availableDirections),
  );
  const tabs = getAvailableTabs(initialValue, availableDirections);
  const direction = getDirection(value);

  const handleTabChange = (tabValue: string | null) => {
    const tab = tabs.find((tab) => tab.direction === tabValue);
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
    <Tabs value={direction} onChange={handleTabChange}>
      <Flex>
        <PopoverBackButton
          p="sm"
          onClick={onBack}
          disabled={readOnly}
          withArrow={!readOnly}
        />
        <Tabs.List className={S.TabList}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.direction} value={tab.direction}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Flex>
      <Divider />
      {tabs.map((tab) => (
        <Tabs.Panel key={tab.direction} value={tab.direction}>
          {value != null && isOffsetIntervalValue(value) ? (
            <DateOffsetIntervalPicker
              value={value}
              availableUnits={availableUnits}
              renderSubmitButton={renderSubmitButton}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          ) : value != null && isIntervalValue(value) ? (
            <DateIntervalPicker
              value={value}
              availableUnits={availableUnits}
              renderSubmitButton={renderSubmitButton}
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
