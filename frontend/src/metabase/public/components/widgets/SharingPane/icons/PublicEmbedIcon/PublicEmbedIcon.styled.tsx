import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { SharingPaneButtonContent } from "../../SharingPaneButton/SharingPaneButton.styled";

interface PublicEmbedIconRootProps {
  disabled: boolean;
}

export const PublicEmbedIconRoot = styled.svg<PublicEmbedIconRootProps>`
  ${({ theme, disabled }) => css`
    color: ${theme.colors.bg[1]};

    .innerFill {
      stroke: ${disabled ? theme.colors.text[0] : theme.colors.bg[2]};
      opacity: ${disabled ? 0.5 : 1};
    }
  `}

  ${({ disabled, theme }) =>
    !disabled &&
    css`
      ${SharingPaneButtonContent}:hover & {
        color: ${theme.colors.bg[2]};

        .innerFill {
          stroke: ${theme.colors.brand[1]};
        }
      }
    `}
`;
