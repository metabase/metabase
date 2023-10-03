import type { ReactNode, MouseEvent } from "react";
import { OptionButtonRoot } from "./OptionButton.styled";

export interface OptionButtonProps {
  isSelected?: boolean;
  children?: ReactNode;
  onClick?: (event: MouseEvent) => void;
}

export function OptionButton({
  isSelected,
  children,
  onClick,
}: OptionButtonProps) {
  return (
    <OptionButtonRoot isSelected={isSelected} onClick={onClick}>
      {children}
    </OptionButtonRoot>
  );
}
