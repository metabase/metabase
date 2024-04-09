import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { SharingPaneButtonContent } from "../../SharingPaneButton/SharingPaneButton.styled";

export const StaticEmbedIconRoot = styled.svg`
  ${({ theme }) =>
    css`
      color: ${theme.fn.themeColor("bg-medium")};

      .innerFill {
        fill: ${theme.fn.themeColor("bg-dark")};
        fill-opacity: 0.5;
      }

      ${SharingPaneButtonContent}:hover & {
        color: ${theme.fn.themeColor("focus")};

        .innerFill {
          fill: ${theme.fn.themeColor("brand")};
          fill-opacity: 1;
        }
      }
    `}
`;
