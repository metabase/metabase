import type { ReactNode } from "react";
import { BackButton } from "../BackButton";
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
      {onBack && <BackButton onClick={onBack}>{columnName}</BackButton>}
      {children}
    </FilterHeaderRoot>
  );
}
