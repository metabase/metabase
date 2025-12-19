import { t } from "ttag";

import { Checkbox } from "metabase/ui";

import type { SelectionCheckboxProps } from "../types";

function getAriaLabel(isSelected: boolean, isSomeSelected: boolean): string {
  if (isSelected) {
    return t`Deselect row`;
  }
  if (isSomeSelected) {
    return t`Select all in group`;
  }
  return t`Select row`;
}

export function SelectionCheckbox({
  isSelected,
  isSomeSelected,
  disabled,
  onClick,
  className,
}: SelectionCheckboxProps) {
  return (
    <Checkbox
      size="sm"
      checked={isSelected}
      indeterminate={isSomeSelected && !isSelected}
      disabled={disabled}
      className={className}
      readOnly
      onClick={onClick}
      aria-label={getAriaLabel(isSelected, isSomeSelected)}
    />
  );
}
