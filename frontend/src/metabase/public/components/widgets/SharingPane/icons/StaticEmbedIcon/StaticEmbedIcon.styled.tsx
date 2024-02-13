import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { SharingPaneButtonContent } from "metabase/public/components/widgets/SharingPane/SharingPaneButton/SharingPaneButton.styled";

export const StaticEmbedIconRoot = styled.svg`
  ${({ theme }) =>
    css`
      color: ${theme.colors.bg[1]};

      .innerFill {
        fill: ${theme.colors.bg[2]};
        fill-opacity: 0.5;
      }

      ${SharingPaneButtonContent}:hover & {
        color: ${theme.colors.focus};

        .innerFill {
          fill: ${theme.colors.brand[1]};
          fill-opacity: 1;
        }
      }
    `}
`;
