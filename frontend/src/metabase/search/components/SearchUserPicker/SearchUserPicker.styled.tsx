import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { ButtonProps } from "metabase/ui";
import { Stack, Button, Group, TextInput } from "metabase/ui";

export const SearchUserPickerContainer = styled(Stack)`
  overflow: hidden;
`;

export const SearchUserItemContainer = styled(Group)`
  overflow-y: auto;
`;

export const UserPickerInput = styled(TextInput)`
  flex: 1;
`;

export const SearchUserPickerContent = styled(Stack)`
  overflow-y: auto;
  flex: 1;
`;

export const SearchUserSelectBox = styled(Stack)`
  border: ${({ theme }) => theme.fn.themeColor("border")} 1px solid;
  border-radius: ${({ theme }) => theme.radius.md};
`;

export const SelectedUserButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  ${({ theme }) => {
    const primaryColor = theme.fn.themeColor("brand");
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
