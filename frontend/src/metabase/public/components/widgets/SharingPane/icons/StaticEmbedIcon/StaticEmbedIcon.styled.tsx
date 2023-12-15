import { css } from "@emotion/react";
import styled from "@emotion/styled/dist/emotion-styled.cjs";
import { SharingPaneButtonContent } from "metabase/public/components/widgets/SharingPane/SharingPaneButton/SharingPaneButton.styled";

export const StaticEmbedIconRoot = styled.svg`
  ${({ theme }) =>
    css`
      rect.outerFill {
        stroke: ${theme.colors.bg[1]};
      }

      path.outerFill {
        fill: ${theme.colors.bg[1]};
      }

      .innerFill {
        fill: ${theme.colors.text[2]};
      }

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
