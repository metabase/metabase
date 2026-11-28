import type { ReactNode, Ref } from "react";

import type { GoalValue } from "metabase-types/api";
import { isGoalStaticValue } from "metabase-types/guards";

import { ChartSettingInputNumeric } from "../ChartSettingInputNumeric";

type Props = {
  "aria-label"?: string;
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  rightSection?: ReactNode;
  value: GoalValue | null;
  onChange: (value: number | null) => void;
};

export function StaticGoalValueInput({
  "aria-label": ariaLabel,
  id,
  inputRef,
  placeholder,
  rightSection,
  value,
  onChange,
}: Props) {
  const numericValue = isGoalStaticValue(value) ? value : null;

  return (
    <ChartSettingInputNumeric
      aria-label={ariaLabel}
      id={id}
      inputRef={inputRef}
      placeholder={placeholder}
      rightSection={rightSection}
      value={numericValue ?? undefined}
      onChange={(typedValue) => {
        const newValue = typedValue ?? null;
        if (newValue !== numericValue) {
          onChange(newValue);
        }
      }}
    />
  );
}
