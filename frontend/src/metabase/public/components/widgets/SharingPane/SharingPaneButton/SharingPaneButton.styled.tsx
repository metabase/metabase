import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import { css } from "@emotion/react";
import type { PaperProps, ButtonProps } from "metabase/ui";
import { Button, Paper, Title } from "metabase/ui";

export const SharingPaneButtonTitle = styled(Title)``;
export const SharingPaneActionButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>``;

export const SharingPaneButtonContent = styled(Paper)<
  PaperProps & { disabled?: boolean }
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
