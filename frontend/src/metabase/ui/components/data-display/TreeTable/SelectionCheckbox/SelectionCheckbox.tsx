import type { MouseEvent } from "react";
import { t } from "ttag";

import { Checkbox } from "metabase/ui";

import type { SelectionState } from "../types";

interface SelectionCheckboxProps {
  selectionState: SelectionState;
  disabled?: boolean;
  onClick: (event: MouseEvent) => void;
  className?: string;
}

function getAriaLabel(selectionState: SelectionState): string {
  switch (selectionState) {
    case "all":
      return t`Deselect row`;
    case "some":
      return t`Select all in group`;
    case "none":
    default:
      return t`Select row`;
  }
}

export function SelectionCheckbox({
  selectionState,
  disabled,
  onClick,
  className,
}: SelectionCheckboxProps) {
  return (
    <Checkbox
      size="sm"
      checked={selectionState !== "none"}
      indeterminate={selectionState === "some"}
      disabled={disabled}
      className={className}
      onChange={() => {}}
      onClick={onClick}
      aria-label={getAriaLabel(selectionState)}
    />
  );
}
