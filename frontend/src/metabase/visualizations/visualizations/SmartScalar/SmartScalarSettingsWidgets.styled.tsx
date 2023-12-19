import styled from "@emotion/styled";
import type { MouseEvent } from "react";
import { Button, Menu, NumberInput } from "metabase/ui";

//getStylesRef

type ButtonProps = {
  disabled: boolean;
};

export const ButtonStyled = styled(Button)<ButtonProps>`
  padding-right: 0;
  padding-left: 1rem;
  width: 100%;

  span {
    width: 100%;
    height: 100%;
  }
`;

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

export const NumberInputStyled = styled(NumberInput)`
  .emotion-Input-wrapper {
    margin-top: 0;
  }

  .emotion-Input-input {
    text-align: center;
  }
`;
