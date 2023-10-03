import styled from "@emotion/styled";
import { css } from "@emotion/react";
import type { HTMLAttributes } from "react";
import type { ButtonProps } from "metabase/ui";
import { Stack, Button, Group } from "metabase/ui";

export const SearchUserPickerContainer = styled(Stack)`
  overflow: hidden;
`;

export const SearchUserPickerContent = styled(Stack)`
  overflow-y: auto;
`;

export const SearchUserSelectBox = styled(Group)`
  border: ${({ theme }) => theme.colors.border[0]} 1px solid;
  border-radius: ${({ theme }) => theme.radius.md};
`;

export const SelectedUserButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  ${({ theme }) => {
    const primaryColor = theme.colors.brand[1];
    const backgroundColor = theme.fn.lighten(primaryColor, 0.8);
    const hoverBackgroundColor = theme.fn.lighten(primaryColor, 0.6);

    return css`
      background-color: ${backgroundColor};
      border: 0;

      &:hover {
        background-color: ${hoverBackgroundColor};
      }
    `;
  }}
`;
