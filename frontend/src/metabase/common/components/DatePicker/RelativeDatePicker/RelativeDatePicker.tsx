import { Button, Group, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import { BackButton } from "../BackButton";
import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";
import { DEFAULT_VALUE, UNIT_GROUPS } from "./constants";
import { getCurrentValue } from "./utils";

interface RelativeDatePickerProps {
  value?: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
  onBack: () => void;
}

export const RelativeDatePicker = ({
  value = DEFAULT_VALUE,
  onChange,
  onBack,
}: RelativeDatePickerProps) => {
  return (
    <div>
      <BackButton onClick={onBack} />
      <CurrentPicker value={value} onChange={onChange} />
    </div>
  );
};

interface CurrentPickerProps {
  value?: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

const CurrentPicker = ({ value, onChange }: CurrentPickerProps) => {
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
              variant={unit === value?.unit ? "filled" : "outline"}
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
};
