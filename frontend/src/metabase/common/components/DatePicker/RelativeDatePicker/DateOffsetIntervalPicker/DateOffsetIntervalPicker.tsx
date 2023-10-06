import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Button, Group, NumberInput, Select, Text } from "metabase/ui";
import type { DateIntervalValue, DateOffsetIntervalValue } from "../types";
import { PickerGrid } from "./DateOffsetIntervalPicker.styled";

interface DateOffsetIntervalPickerProps {
  value: DateOffsetIntervalValue;
  isNew: boolean;
  onChange: (value: DateIntervalValue) => void;
  onSubmit: () => void;
}

export function DateOffsetIntervalPicker({
  value,
  isNew,
  onSubmit,
}: DateOffsetIntervalPickerProps) {
  return (
    <div>
      <PickerGrid p="md">
        <Text>{t`Past`}</Text>
        <NumberInput />
        <Select data={[]} />
        <div />
        <Text>{t`Starting from`}</Text>
        <NumberInput />
        <Select data={[]} />
        <Button variant="subtle" leftIcon={<Icon name="close" />} />
      </PickerGrid>
      <Group p="sm" position="right">
        <Button variant="filled" onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
