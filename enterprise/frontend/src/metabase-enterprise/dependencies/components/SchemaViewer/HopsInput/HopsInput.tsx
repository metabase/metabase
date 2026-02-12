import { t } from "ttag";

import { FixedSizeIcon, Group, NumberInput, Text } from "metabase/ui";

import S from "./HopsInput.module.css";

interface HopsInputProps {
  value: number;
  onChange: (value: number) => void;
}

const MIN_HOPS = 1;
const MAX_HOPS = 4;

export function HopsInput({ value, onChange }: HopsInputProps) {
  const handleChange = (newValue: string | number) => {
    const numValue =
      typeof newValue === "string" ? parseInt(newValue, 10) : newValue;
    if (!isNaN(numValue) && numValue >= MIN_HOPS && numValue <= MAX_HOPS) {
      onChange(numValue);
    }
  };

  return (
    <Group
      className={S.container}
      gap="sm"
      align="center"
      wrap="nowrap"
      data-testid="hops-input"
    >
      <FixedSizeIcon name="network" c="text-tertiary" />
      <Text fw={700}>{t`Steps`}</Text>
      <NumberInput
        value={value}
        variant="unstyled"
        onChange={handleChange}
        min={MIN_HOPS}
        max={MAX_HOPS}
        step={1}
        w="2.5rem"
        size="xs"
        hideControls={false}
        classNames={{
          root: S.numberInputRoot,
          wrapper: S.numberInputWrapper,
          input: S.numberInput,
        }}
        data-testid="hops-number-input"
      />
    </Group>
  );
}
