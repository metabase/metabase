import type { ReactNode } from "react";

import { Group } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import { ButtonsContainer, EditIcon, Root, Title } from "./EditBar.styled";

type Props = {
  title: string;
  center?: ReactNode;
  buttons: ReactNode;
  /** Defaults to Metabase blue. Permissions passes its own accent color, see
   * `selection-color.tsx`. */
  accentColor?: ColorName;
  className?: string;
  "data-testid"?: string;
};

export function EditBar({
  title,
  center,
  buttons,
  accentColor = "core-brand",
  className,
  "data-testid": dataTestId,
}: Props) {
  return (
    <Root
      className={className}
      accentColor={accentColor}
      data-testid={dataTestId ?? "edit-bar"}
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <EditIcon name="pencil" size={12} />
        <Title>{title}</Title>
      </Group>
      {center && <div>{center}</div>}
      <ButtonsContainer accentColor={accentColor}>{buttons}</ButtonsContainer>
    </Root>
  );
}
