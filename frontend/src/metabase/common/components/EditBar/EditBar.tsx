import type { ReactNode } from "react";

import { Group } from "metabase/ui";

import { ButtonsContainer, EditIcon, Root, Title } from "./EditBar.styled";

type Props = {
  title: string;
  center?: ReactNode;
  buttons: ReactNode;
  admin?: boolean;
  className?: string;
  "data-testid"?: string;
};

export function EditBar({
  title,
  center,
  buttons,
  admin = false,
  className,
  "data-testid": dataTestId,
}: Props) {
  return (
    <Root
      className={className}
      admin={admin}
      data-testid={dataTestId ?? "edit-bar"}
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <EditIcon name="pencil" size={12} />
        <Title>{title}</Title>
      </Group>
      {center && <div>{center}</div>}
      <ButtonsContainer>{buttons}</ButtonsContainer>
    </Root>
  );
}
