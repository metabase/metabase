import type { FormEvent } from "react";
import { useState } from "react";
import { t } from "ttag";
import {
  Box,
  Flex,
  NumberInput,
  PopoverBackButton,
  TextInput,
} from "metabase/ui";
import type { SelectedComparisonStaticNumber } from "metabase-types/api";
import { COMPARISON_TYPES } from "../constants";
import { DoneButton } from "./SmartScalarSettingsWidgets.styled";

interface StaticNumberFormProps {
  value: Partial<SelectedComparisonStaticNumber>;
  onChange: (setting: SelectedComparisonStaticNumber) => void;
  onBack: () => void;
}

export function StaticNumberForm({
  value: selectedValue,
  onChange,
  onBack,
}: StaticNumberFormProps) {
  const [label, setLabel] = useState(selectedValue.label || "");
  const [value, setValue] = useState(selectedValue.value || 0);

  const canSubmit = label.length > 0;

  const handleChangeLabel = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      <Flex direction="column" align="flex-start" gap="lg">
        <PopoverBackButton
          onClick={onBack}
        >{t`Custom value`}</PopoverBackButton>
        <Flex gap="sm">
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
        </Flex>
        <DoneButton
          type="submit"
          variant="filled"
          disabled={!canSubmit}
        >{t`Done`}</DoneButton>
      </Flex>
    </Box>
  );
}
