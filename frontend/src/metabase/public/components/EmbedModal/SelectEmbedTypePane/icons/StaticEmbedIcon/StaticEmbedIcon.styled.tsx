import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { SharingPaneButtonContent } from "../../SharingPaneButton/SharingPaneButton.styled";

export const StaticEmbedIconRoot = styled.svg`
  ${({ theme }) =>
    css`
      color: ${theme.fn.themeColor("bg-medium")};

      .innerFill {
        fill: var(--mb-color-bg-dark);
        fill-opacity: 0.5;
      }

      ${SharingPaneButtonContent}:hover & {
        color: var(--mb-color-focus);

        .innerFill {
          fill: ${theme.fn.themeColor("brand")};
          fill-opacity: 1;
        }
      }
    `}
`;
