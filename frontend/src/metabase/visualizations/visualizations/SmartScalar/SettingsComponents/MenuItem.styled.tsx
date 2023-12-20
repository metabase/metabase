import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import type { MenuItemProps } from "metabase/ui";
import { Menu } from "metabase/ui";

type MenuItemStyledProps = MenuItemProps &
  HTMLAttributes<HTMLButtonElement> & {
    "aria-selected"?: boolean;
  };

export const MenuItemStyled = styled(Menu.Item)<MenuItemStyledProps>`
  ${({ theme, "aria-selected": isSelected }) =>
    isSelected &&
    `
    color: ${theme.colors.brand[1]};
    background-color: ${theme.colors.brand[0]};`}
`;
