import { useState } from "react";
import { Icon } from "metabase/core/components/Icon";
import { Button, Flex, Tabs } from "metabase/ui";
import type { RelativeDatePickerValue } from "../types";
import { DEFAULT_VALUE, TABS } from "./constants";
import { getTabType, getValueAfterTabChange } from "./utils";

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

  return (
    <div>
      <PickerHeader value={value} onChange={setValue} onBack={onBack} />
    </div>
  );
}

interface PickerHeaderProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
  onBack: () => void;
}

function PickerHeader({ value, onChange, onBack }: PickerHeaderProps) {
  const type = getTabType(value);

  const handleChange = (type: string | null) => {
    const tab = TABS.find(tab => tab.type === type);
    if (tab) {
      onChange(getValueAfterTabChange(tab.type, value));
    }
  };

  return (
    <Flex>
      <Button
        c="text.1"
        display="block"
        variant="subtle"
        leftIcon={<Icon name="chevronleft" />}
        onClick={onBack}
      />
      <Tabs value={type} onTabChange={handleChange}>
        <Tabs.List>
          {TABS.map(tab => (
            <Tabs.Tab key={tab.type} value={tab.type}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </Flex>
  );
}
