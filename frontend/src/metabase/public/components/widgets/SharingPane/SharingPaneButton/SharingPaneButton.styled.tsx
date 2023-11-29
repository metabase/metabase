import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import { css } from "@emotion/react";
import type { CenterProps, ButtonProps } from "metabase/ui";
import { Button, Center, Title } from "metabase/ui";

export const SharingPaneButtonTitle = styled(Title)`
  transition: 200ms all;
`;
export const SharingPaneActionButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  transition: 200ms all;
`;

export const SharingPaneButtonContent = styled(Center)<
  CenterProps & HTMLAttributes<HTMLDivElement> & { disabled?: boolean }
>`
  ${({ disabled, theme }) =>
    !disabled &&
    css`
      &:hover {
        ${SharingPaneActionButton} {
          background-color: ${theme.colors.brand[1]};
          color: white;
        }

        ${SharingPaneButtonTitle} {
          color: ${theme.colors.brand[1]};
        }
      }
    `}
`;
