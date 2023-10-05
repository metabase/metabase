import { useState } from "react";
import { Button, Divider, Flex, Group, Stack, Tabs } from "metabase/ui";
import * as Lib from "metabase-lib";
import { BackButton } from "../BackButton";
import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";
import { DEFAULT_VALUE, TABS, UNIT_GROUPS } from "./constants";
import { getCurrentValue, getTabType, getValueAfterTabChange } from "./utils";
import { TabList } from "./RelativeDatePicker.styled";

interface RelativeDatePickerProps {
  value?: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
  onBack: () => void;
}

export function RelativeDatePicker({
  value: initialValue = DEFAULT_VALUE,
  onChange,
  onBack,
}: RelativeDatePickerProps) {
  const [value, setValue] = useState(initialValue);
  const type = getTabType(value);

  const handleChange = (type: string | null) => {
    const tab = TABS.find(tab => tab.type === type);
    if (tab) {
      setValue(getValueAfterTabChange(tab.type, value));
    }
  };

  return (
    <Tabs value={type} onTabChange={handleChange}>
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
      <Tabs.Panel value="current">
        <CurrentPicker value={value} onChange={onChange} />
      </Tabs.Panel>
    </Tabs>
  );
}

interface CurrentPickerProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

function CurrentPicker({ value, onChange }: CurrentPickerProps) {
  const handleClick = (unit: DatePickerTruncationUnit) => {
    onChange(getCurrentValue(unit));
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
