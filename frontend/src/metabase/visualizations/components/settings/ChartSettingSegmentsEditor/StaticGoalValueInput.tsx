import type { ReactNode, Ref } from "react";

import { NumberInput } from "metabase/ui";
import type { GoalValue } from "metabase-types/api";

export type StaticGoalValueInputProps = {
  "aria-label"?: string;
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  rightSection?: ReactNode;
  value: GoalValue | null;
  onCommit: (value: number | null) => void;
};

export function StaticGoalValueInput({
  "aria-label": ariaLabel,
  id,
  inputRef,
  placeholder,
  rightSection,
  value,
  onCommit,
}: StaticGoalValueInputProps) {
  const numericValue = typeof value === "number" ? value : null;

  return (
    <NumberInput
      aria-label={ariaLabel}
      id={id}
      ref={inputRef}
      placeholder={placeholder}
      rightSection={rightSection}
      rightSectionPointerEvents="all"
      value={numericValue ?? ""}
      w="100%"
      onBlur={(event) => {
        const rawValue = event.target.value;
        const newValue = rawValue === "" ? null : parseFloat(rawValue);
        if (newValue !== numericValue) {
          onCommit(newValue);
        }
      }}
    />
  );
}
