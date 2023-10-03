import type { MouseEvent, ReactNode } from "react";
import { Button } from "metabase/ui";

export interface BackButtonProps {
  children?: ReactNode;
  onClick?: (event: MouseEvent) => void;
}

export function BackButton({ children, onClick }: BackButtonProps) {
  return (
    <Button c="text.1" display="block" variant="subtle" onClick={onClick}>
      {children}
    </Button>
  );
}
