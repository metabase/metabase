import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import { breakpointMinLarge } from "metabase/styled-components/theme";

type ScalarValueProps = {
  isDashboard?: boolean;
  gridSize?: { height: number; width: number };
};

export const ScalarRoot = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
`;

export const ScalarValueWrapper = styled.h1<ScalarValueProps>`
  cursor: pointer;
  &:hover {
    color: ${color("brand")};
  }

  ${({ isDashboard, gridSize }) => {
    if (!isDashboard || !gridSize) {
      return undefined;
    }

    const { width } = gridSize;
    let fontSize = "1.8rem";
    let breakpointFontSize = "2.8rem";
    if (width >= 9) {
      fontSize = "3.8rem";
      breakpointFontSize = "4.8rem";
    } else if (width >= 6) {
      fontSize = "2.8rem";
      breakpointFontSize = "3.8rem";
    }

    return css`
      font-size: ${fontSize};
      ${breakpointMinLarge} {
        font-size: ${breakpointFontSize};
      }
    `;
  }}
`;
