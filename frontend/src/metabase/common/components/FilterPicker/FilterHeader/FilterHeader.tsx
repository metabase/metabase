import type { ReactNode } from "react";
import { BackButton } from "../BackButton";
import { FilterHeaderRoot } from "./FilterHeader.styled";

interface FilterHeaderProps {
  columnName: string;
  children?: ReactNode;
  onBack: () => void;
}

export function FilterHeader({
  columnName,
  children,
  onBack,
}: FilterHeaderProps) {
  return (
    <FilterHeaderRoot p="sm" justify="space-between">
      <BackButton onClick={onBack}>{columnName}</BackButton>
      {children}
    </FilterHeaderRoot>
  );
}
