import type { ReactNode } from "react";
import { BackButton } from "./BackButton";
import { FilterHeaderRoot } from "./FilterPicker.styled";

interface HeaderProps {
  columnName: string;
  children?: ReactNode;
  onBack: () => void;
}

export function Header({ columnName, children, onBack }: HeaderProps) {
  return (
    <FilterHeaderRoot>
      <BackButton onClick={onBack}>{columnName}</BackButton>
      {children}
    </FilterHeaderRoot>
  );
}
