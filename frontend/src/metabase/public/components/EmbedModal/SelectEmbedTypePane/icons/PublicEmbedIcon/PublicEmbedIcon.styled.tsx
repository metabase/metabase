import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { SharingPaneButtonContent } from "../../SharingPaneButton/SharingPaneButton.styled";

interface PublicEmbedIconRootProps {
  disabled: boolean;
}

export const PublicEmbedIconRoot = styled.svg<PublicEmbedIconRootProps>`
  ${({ theme, disabled }) => css`
    color: ${theme.fn.themeColor("bg-medium")};

    .innerFill {
      stroke: ${disabled
        ? theme.fn.themeColor("text-light")
        : theme.fn.themeColor("bg-dark")};
      opacity: ${disabled ? 0.5 : 1};
    }
  `}

  ${({ disabled, theme }) =>
    !disabled &&
    css`
      ${SharingPaneButtonContent}:hover & {
        color: ${theme.fn.themeColor("bg-dark")};

        .innerFill {
          stroke: ${theme.fn.themeColor("brand")};
        }
      }
    `}
`;
