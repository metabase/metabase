import { useState } from "react";
import { t } from "ttag";
import {
  Button,
  Divider,
  Flex,
  Group,
  NumberInput,
  Select,
  Stack,
  Tabs,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import { BackButton } from "../BackButton";
import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";
import { DEFAULT_VALUE, TABS, UNIT_GROUPS } from "./constants";
import {
  getDirection,
  getInterval,
  getUnitOptions,
  isIntervalValue,
  setDirection,
  setInterval,
  setUnit,
} from "./utils";
import type { RelativeDateIntervalValue } from "./types";
import { TabList } from "./RelativeDatePicker.styled";

interface RelativeDatePickerProps {
  value?: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
  onBack: () => void;
}

export function RelativeDatePicker({
  value: initialValue,
  onChange,
  onBack,
}: RelativeDatePickerProps) {
  const [value, setValue] = useState(initialValue ?? DEFAULT_VALUE);
  const direction = getDirection(value);
  const isNew = initialValue == null;

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
          {isIntervalValue(value) ? (
            <IntervalPicker
              value={value}
              isNew={isNew}
              onChange={setValue}
              onSubmit={handleSubmit}
            />
          ) : (
            <CurrentPicker value={value} onChange={onChange} />
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

interface CurrentPickerProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

function CurrentPicker({ value, onChange }: CurrentPickerProps) {
  const handleClick = (unit: DatePickerTruncationUnit) => {
    onChange({ type: "relative", value: "current", unit });
  };

  return (
    <Stack p="md">
      {UNIT_GROUPS.map((group, groupIndex) => (
        <Group key={groupIndex}>
          {group.map(unit => (
            <Button
              key={unit}
              variant={unit === value.unit ? "filled" : "default"}
              radius="xl"
              onClick={() => handleClick(unit)}
            >
              {Lib.describeTemporalUnit(unit)}
            </Button>
          ))}
        </Group>
      ))}
    </Stack>
  );
}

interface IntervalPickerProps {
  value: RelativeDateIntervalValue;
  isNew: boolean;
  onChange: (value: RelativeDateIntervalValue) => void;
  onSubmit: () => void;
}

function IntervalPicker({
  value,
  isNew,
  onChange,
  onSubmit,
}: IntervalPickerProps) {
  const interval = getInterval(value);
  const options = getUnitOptions(interval);

  const handleIntervalChange = (inputValue: number | "") => {
    if (inputValue !== "") {
      onChange(setInterval(value, inputValue));
    }
  };

  const handleUnitChange = (inputValue: string | null) => {
    const option = options.find(option => option.value === inputValue);
    if (option) {
      onChange(setUnit(value, option.value));
    }
  };

  return (
    <div>
      <Group p="md">
        <NumberInput
          value={interval}
          w="4rem"
          onChange={handleIntervalChange}
        />
        <Select
          data={options}
          value={value.unit}
          withinPortal={false}
          onChange={handleUnitChange}
        />
      </Group>
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
