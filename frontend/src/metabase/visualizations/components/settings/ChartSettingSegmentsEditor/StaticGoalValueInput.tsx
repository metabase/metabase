import type { ReactNode, Ref } from "react";

import { NumberInput } from "metabase/ui";
import type { GoalValue } from "metabase-types/api";

import { RIGHT_SECTION_WIDTH } from "./constants";

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
  const numericValue = typeof value === "number" ? value : null;

  return (
    <NumberInput
      aria-label={ariaLabel}
      id={id}
      ref={inputRef}
      placeholder={placeholder}
      rightSection={rightSection}
      rightSectionPointerEvents="all"
      rightSectionWidth={RIGHT_SECTION_WIDTH}
      value={numericValue ?? ""}
      w="100%"
      onBlur={(event) => {
        const parsedValue = parseFloat(event.target.value);
        const newValue = Number.isNaN(parsedValue) ? null : parsedValue;
        if (newValue !== numericValue) {
          onChange(newValue);
        }
      }}
    />
  );
}
