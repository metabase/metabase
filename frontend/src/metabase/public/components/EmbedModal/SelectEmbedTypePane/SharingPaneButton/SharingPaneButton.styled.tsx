import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { ButtonProps, PaperProps } from "metabase/ui";
import { Button, Paper, Title } from "metabase/ui";

type SharingPaneElementProps = {
  disabled?: boolean;
};

export const SharingPaneButtonContent = styled(Paper)<
  PaperProps & { disabled?: boolean }
>`
  cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};
`;

export const SharingPaneButtonTitle = styled(Title)<SharingPaneElementProps>`
  ${({ disabled }) =>
    !disabled
      ? css`
          ${SharingPaneButtonContent}:hover & {
            color: var(--mb-color-brand);
          }
        `
      : css`
          color: var(--mb-color-text-light);
        `}
`;

export const SharingPaneActionButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement> & SharingPaneElementProps
>`
  ${({ disabled }) =>
    !disabled &&
    css`
      ${SharingPaneButtonContent}:hover & {
        background-color: var(--mb-color-brand);
        color: white;
      }
    `}
`;
