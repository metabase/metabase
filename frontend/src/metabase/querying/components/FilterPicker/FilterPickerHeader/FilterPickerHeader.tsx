import type { ReactNode } from "react";

import { PopoverBackButton } from "metabase/ui";

import { FilterHeaderRoot } from "./FilterPickerHeader.styled";

interface FilterPickerHeaderProps {
  columnName: string;
  children?: ReactNode;
  onBack?: () => void;
}

export function FilterPickerHeader({
  columnName,
  children,
  onBack,
}: FilterPickerHeaderProps) {
  return (
    <FilterHeaderRoot px="md" py="sm" justify="space-between">
      {onBack && (
        <PopoverBackButton pr="md" onClick={onBack}>
          {columnName}
        </PopoverBackButton>
      )}
      {children}
    </FilterHeaderRoot>
  );
}
