import styled from "@emotion/styled";
import type { MouseEvent } from "react";
import { Menu } from "metabase/ui";

type MenuItemProps = {
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  isSelected?: boolean;
  py?: string;
};

export const MenuItemStyled = styled(Menu.Item)<MenuItemProps>`
  ${({ theme, isSelected }) =>
    isSelected &&
    `
    color: ${theme.colors.brand[1]};
    background-color: ${theme.colors.brand[0]};`}
`;
