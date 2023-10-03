import type { ReactNode, MouseEvent } from "react";
import { Group } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { BackButtonRoot } from "./BackButton.styled";

export interface BackButtonProps {
  children?: ReactNode;
  onClick?: (event: MouseEvent) => void;
}

export function BackButton({ children, onClick }: BackButtonProps) {
  return (
    <BackButtonRoot onClick={onClick}>
      <Group spacing="xs">
        <Icon name="chevronleft" />
        {children}
      </Group>
    </BackButtonRoot>
  );
}
