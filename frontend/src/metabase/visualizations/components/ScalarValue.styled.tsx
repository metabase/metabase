import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import { breakpointMinLarge } from "metabase/styled-components/theme";

type ScalarValueProps = {
  isDashboard?: boolean;
  gridSize?: { height: number; width: number };
  width: number;
  height: number;
  numGridColumns: number;
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

  ${({ isDashboard, gridSize, width, height, numGridColumns }) => {
    if (!isDashboard || !gridSize || !width || !height) {
      return undefined;
    }

    // at small viewport widths numGridColumns is set to 1, but gridSize.width isn't updated,
    // so we need to pick whichever is smallest.
    const gridSizeWidth = Math.min(numGridColumns, gridSize.width);

    const pxPerUnit = width / gridSizeWidth;
    const maxWidthPx = numGridColumns * pxPerUnit;
    // 3 is taken from Scalar's min grid size -- should make it a constant.
    const minWidthPx = 3 * pxPerUnit;

    // arbitrary maxSize
    const maxSize = 12;
    // minSize taken from previous styling code
    const minSize = 2.2;
    // the 4 is an arbitrary value between minSize and maxSize
    const gridWidthAdjustment =
      ((width - minWidthPx) / (maxWidthPx - minWidthPx)) * 4;

    // 10 is approximately the number of dashboard grid rows that are visible when browser is fully expanded
    const maxHeightPx = 10 * pxPerUnit;
    // 3 is taken from Scalar's min grid size -- should make it a constant.
    const minHeightPx = 3 * pxPerUnit;
    // the 4 is an arbitrary value between minSize and maxSize
    const gridHeightAdjustment =
      ((height - minHeightPx) / (maxHeightPx - minHeightPx)) * 4;

    // clamp the size in case the combo of gridWidthAdjustment and gridHeightAdjustment makes the font too small or too big
    const fontSize = Math.min(
      Math.max(minSize + gridWidthAdjustment + gridHeightAdjustment, minSize),
      maxSize,
    );

    return css`
      font-size: ${fontSize}rem;
    `;
  }}
`;
