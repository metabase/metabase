import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import type {
  DatePickerOperator,
  DatePickerValue,
} from "metabase/common/components/DatePicker";
import { Button, Group, Select, Stack } from "metabase/ui";
import { CurrentDatePicker } from "./CurrentDatePicker";
import { getAvailableOptions, getOptionType } from "./utils";

interface SimpleDatePickerProps {
  initialValue?: DatePickerValue;
  availableOperators: DatePickerOperator[];
  onChange: (value: DatePickerValue | undefined) => void;
}

export function SimpleDatePicker({
  initialValue,
  availableOperators,
  onChange,
}: SimpleDatePickerProps) {
  const [value, setValue] = useState(initialValue);

  const options = useMemo(() => {
    return getAvailableOptions(availableOperators);
  }, [availableOperators]);

  const optionType = useMemo(() => {
    return getOptionType(value);
  }, [value]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(value);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack p="md">
        <Group>
          <Select data={options} value={optionType} />
          <InlineFilterPicker value={value} onChange={setValue} />
        </Group>
        <BlockFilterFilter value={value} onChange={setValue} />
        <Button type="submit" variant="filled" fullWidth>{t`Apply`}</Button>
      </Stack>
    </form>
  );
}

interface InlineFilterPickerProps {
  value?: DatePickerValue;
  onChange: (value: DatePickerValue) => void;
}

function InlineFilterPicker({ value, onChange }: InlineFilterPickerProps) {
  if (value?.type === "relative") {
    if (value.value === "current") {
      return <CurrentDatePicker value={value} onChange={onChange} />;
    }
  }

  return null;
}

interface BlockFilterPickerProps {
  value?: DatePickerValue;
  onChange: (value: DatePickerValue) => void;
}

function BlockFilterFilter(props: BlockFilterPickerProps) {
  return null;
}
