import type { ReactNode, MouseEvent } from "react";
import { Button } from "metabase/ui";

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
    <Button
      c={isSelected ? "brand.1" : "text.2"}
      variant="subtle"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
