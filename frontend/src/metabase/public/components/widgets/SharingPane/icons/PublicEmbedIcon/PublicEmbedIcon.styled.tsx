import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { SharingPaneButtonContent } from "../../SharingPaneButton/SharingPaneButton.styled";

interface PublicEmbedIconRootProps {
  disabled: boolean;
}

export const PublicEmbedIconRoot = styled.svg<PublicEmbedIconRootProps>`
  ${({ theme }) => css`
    .outerFill {
      stroke: ${theme.colors.bg[1]};
    }

    .innerFill {
      stroke: ${theme.colors.text[2]};
    }
  `}

  ${({ disabled, theme }) =>
    !disabled &&
    css`
      ${SharingPaneButtonContent}:hover & {
        .outerFill {
          stroke: ${theme.colors.brand[0]};
        }

        .innerFill {
          stroke: ${theme.colors.brand[1]};
        }
      }
    `}
`;
