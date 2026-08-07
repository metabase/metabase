import type { ReactNode, Ref } from "react";

import { NumberInput } from "metabase/ui";
import type { GoalValue } from "metabase-types/api";

export type StaticGoalValueInputProps = {
  id: string;
  value: GoalValue | null;
  placeholder?: string;
  ariaLabel?: string;
  onCommit: (value: number | null) => void;
  rightSection?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
};

export function StaticGoalValueInput({
  id,
  value,
  placeholder,
  ariaLabel,
  onCommit,
  rightSection,
  inputRef,
}: StaticGoalValueInputProps) {
  // A reference we can't render here (e.g. its column disappeared from the
  // results) still shows an empty input; committing on blur would delete it.
  const numericValue = typeof value === "number" ? value : null;

  return (
    <NumberInput
      id={id}
      ref={inputRef}
      aria-label={ariaLabel}
      placeholder={placeholder}
      w="100%"
      value={numericValue ?? ""}
      rightSection={rightSection}
      rightSectionPointerEvents="all"
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
