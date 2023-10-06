import { useState } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import {
  Button,
  Divider,
  Flex,
  Group,
  Menu,
  NumberInput,
  Select,
  Tabs,
} from "metabase/ui";
import { BackButton } from "../BackButton";
import type { RelativeDatePickerValue } from "../types";
import { DEFAULT_VALUE, TABS } from "./constants";
import {
  describeInterval,
  getDirection,
  getIncludeCurrent,
  getInterval,
  getUnitOptions,
  isIntervalValue,
  setDirection,
  setIncludeCurrent,
  setInterval,
  setUnit,
} from "./utils";
import type { RelativeDateIntervalValue } from "./types";
import { CurrentDatePicker } from "./CurrentDatePicker";
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
      <Group>
        <BackButton onClick={onBack} />
        <TabList>
          {TABS.map(tab => (
            <Tabs.Tab key={tab.direction} value={tab.direction}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </TabList>
      </Group>
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
            <CurrentDatePicker value={value} onChange={onChange} />
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

interface IntervalPickerProps {
  value: RelativeDateIntervalValue;
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
  const interval = getInterval(value);
  const options = getUnitOptions(interval);
  const includeCurrent = getIncludeCurrent(value);

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

  const handleIncludeCurrentChange = () => {
    onChange(setIncludeCurrent(value, !includeCurrent));
  };

  return (
    <div>
      <Flex p="md">
        <NumberInput
          value={interval}
          w="4rem"
          onChange={handleIntervalChange}
        />
        <Select
          data={options}
          value={value.unit}
          withinPortal={false}
          ml="md"
          onChange={handleUnitChange}
        />
        <Menu withinPortal={false}>
          <Menu.Target>
            <Button
              c="text.2"
              variant="subtle"
              leftIcon={<Icon name="ellipsis" />}
            />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              icon={<Icon name={includeCurrent ? "check" : "calendar"} />}
              onClick={handleIncludeCurrentChange}
            >
              {t`Include ${describeInterval(value.unit)}`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Flex>
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
