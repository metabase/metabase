// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { ButtonProps } from "metabase/ui";
import { Button, Group, Stack, TextInput } from "metabase/ui";

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
  border: 1px solid var(--mb-color-border);
  border-radius: ${({ theme }) => theme.radius.md};
`;

export const SelectedUserButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  ${() => {
    return css`
      background-color: var(--mb-color-background-brand) !important;
      border: 0;

      &:hover {
        background-color: var(--mb-color-background-hover) !important;
      }
    `;
  }}
` as unknown as typeof Button;
