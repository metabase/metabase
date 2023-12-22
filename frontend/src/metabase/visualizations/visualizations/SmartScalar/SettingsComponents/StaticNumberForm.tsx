import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { t } from "ttag";
import {
  Box,
  Group,
  NumberInput,
  PopoverBackButton,
  Stack,
  TextInput,
} from "metabase/ui";
import type { SmartScalarComparisonStaticNumber } from "metabase-types/api";
import { COMPARISON_TYPES } from "../constants";
import { DoneButton } from "./SmartScalarSettingsWidgets.styled";

interface StaticNumberFormProps {
  value?: SmartScalarComparisonStaticNumber;
  onChange: (setting: SmartScalarComparisonStaticNumber) => void;
  onBack: () => void;
}

export function StaticNumberForm({
  value: comparison,
  onChange,
  onBack,
}: StaticNumberFormProps) {
  const [label, setLabel] = useState(comparison?.label || "");
  const [value, setValue] = useState(comparison?.value || 0);

  const canSubmit = label.length > 0;

  const handleChangeLabel = (e: ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
  };

  const handleChangeValue = (nextValue: number | "") => {
    setValue(nextValue || 0);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    onChange({
      type: COMPARISON_TYPES.STATIC_NUMBER,
      label,
      value,
    });
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack align="flex-start" spacing="lg">
        <PopoverBackButton
          onClick={onBack}
        >{t`Custom value`}</PopoverBackButton>
        <Group spacing="sm">
          <TextInput
            autoFocus
            value={label}
            label={t`Label`}
            onChange={handleChangeLabel}
            data-autofocus
          />
          <NumberInput
            value={value}
            label={t`Value`}
            onChange={handleChangeValue}
          />
        </Group>
        <DoneButton type="submit" disabled={!canSubmit}>{t`Done`}</DoneButton>
      </Stack>
    </Box>
  );
}
