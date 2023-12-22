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
    <FilterHeaderRoot p="sm" justify="space-between">
      {onBack && (
        <PopoverBackButton onClick={onBack}>{columnName}</PopoverBackButton>
      )}
      {children}
    </FilterHeaderRoot>
  );
}
