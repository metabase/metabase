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
import { getTabType, getUnitOptions, getValueAfterTabChange } from "./utils";
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
  const type = getTabType(value);
  const isNew = initialValue == null;

  const handleTabChange = (type: string | null) => {
    const tab = TABS.find(tab => tab.type === type);
    if (tab) {
      setValue(getValueAfterTabChange(tab.type, value));
    }
  };

  const handleSubmit = () => {
    onChange(value);
  };

  return (
    <Tabs value={type} onTabChange={handleTabChange}>
      <Flex>
        <BackButton onClick={onBack} />
        <TabList>
          {TABS.map(tab => (
            <Tabs.Tab key={tab.type} value={tab.type}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </TabList>
      </Flex>
      <Divider />
      {TABS.map(tab => (
        <Tabs.Panel key={tab.type} value={tab.type}>
          {tab.type === "current" ? (
            <CurrentPicker value={value} onChange={onChange} />
          ) : (
            <IntervalPicker
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
  value: RelativeDatePickerValue;
  isNew: boolean;
  onChange: (value: RelativeDatePickerValue) => void;
  onSubmit: () => void;
}

function IntervalPicker({
  value,
  isNew,
  onChange,
  onSubmit,
}: IntervalPickerProps) {
  const interval = Number(value.value);
  const options = getUnitOptions(interval);

  const handleUnitChange = (newUnit: string | null) => {
    const option = options.find(option => option.value === newUnit);
    if (option) {
      onChange({ ...value, unit: option.value });
    }
  };

  const handleIntervalChange = (newInterval: number | "") => {
    if (newInterval !== "") {
      const sign = Math.sign(interval);
      onChange({ ...value, value: Math.abs(newInterval) * sign });
    }
  };

  return (
    <div>
      <Group p="md">
        <NumberInput
          value={Math.abs(interval)}
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
