import { useState } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Button, Divider, Group } from "metabase/ui";
import type { RelativeDatePickerValue } from "../types";
import { DEFAULT_VALUE } from "./constants";

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
  const [value] = useState(initialValue);

  const handleSubmit = () => {
    onChange(value);
  };

  return (
    <div>
      <PickerHeader value={value} onBack={onBack} />
      <Divider />
      <PickerFooter initialValue={initialValue} onSubmit={handleSubmit} />
    </div>
  );
}

interface PickerHeaderProps {
  value: RelativeDatePickerValue;
  onBack: () => void;
}

function PickerHeader({ onBack }: PickerHeaderProps) {
  return (
    <Group>
      <Button
        c="text.1"
        display="block"
        variant="subtle"
        leftIcon={<Icon name="chevronleft" />}
        onClick={onBack}
      />
    </Group>
  );
}

interface PickerFooterProps {
  initialValue?: RelativeDatePickerValue;
  onSubmit: () => void;
}

function PickerFooter({ initialValue, onSubmit }: PickerFooterProps) {
  return (
    <Group p="sm" position="right">
      <Button variant="filled" onClick={onSubmit}>
        {initialValue ? t`Update filter` : t`Add filter`}
      </Button>
    </Group>
  );
}
