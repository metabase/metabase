import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import { breakpointMinLarge } from "metabase/styled-components/theme";

type ScalarValueProps = {
  isDashboard?: boolean;
  gridSize?: { height: number; width: number };
  width: number;
  height: number;
  totalNumGridCols: number;
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

  ${({
    isDashboard,
    gridSize,
    width: widthPx,
    height: heightPx,
    totalNumGridCols,
  }) => {
    if (!isDashboard || !gridSize || !widthPx || !heightPx) {
      return undefined;
    }

    // at small viewport widths totalNumGridCols is set to 1, but the dashcard's gridSize.width isn't updated.
    // in that scenario, the dashcard's grid width should be treated as 1 as well because it spans the entire grid
    const dashCardGridWidth = Math.min(totalNumGridCols, gridSize.width);
    const widthPxPerGridUnit = widthPx / dashCardGridWidth;
    const maxWidthPx = totalNumGridCols * widthPxPerGridUnit;
    // 3 is taken from Scalar's min grid size -- should make it a constant.
    const minWidthPx = 3 * widthPxPerGridUnit;

    // when the dashcard is at its min width, the `gridWidthAdjustment` value will be 0.
    // as it increases in width, it will increase in value up to `WIDTH_ADJUSTMENT_FACTOR`.
    const WIDTH_ADJUSTMENT_FACTOR = 4;
    const gridWidthAdjustmentRem = Math.max(
      ((widthPx - minWidthPx) / (maxWidthPx - minWidthPx)) *
        WIDTH_ADJUSTMENT_FACTOR,
      0,
    );

    const heightPxPerGridUnit = heightPx / gridSize.height;
    // 10 is approximately the number of dashboard grid rows that are visible when browser is fully expanded
    const maxHeightPx = 10 * heightPxPerGridUnit;
    // 3 is taken from Scalar's min grid size -- should make it a constant.
    const minHeightPx = 3 * heightPxPerGridUnit;

    // when the dashcard is at its min height, the `gridHeightAdjustment` value will be 0.
    // as it increases in height, it will increase in value up to `HEIGHT_ADJUSTMENT_FACTOR`.
    const HEIGHT_ADJUSTMENT_FACTOR = 4;
    const gridHeightAdjustmentRem = Math.max(
      ((heightPx - minHeightPx) / (maxHeightPx - minHeightPx)) *
        HEIGHT_ADJUSTMENT_FACTOR,
      0,
    );

    const minSizeRem = 2.2;
    const maxSizeRem = 12;
    // clamp the size in case the combo of gridWidthAdjustmentRem and gridHeightAdjustmentRem makes the font too small or too big
    const fontSize = Math.min(
      Math.max(
        minSizeRem + gridWidthAdjustmentRem + gridHeightAdjustmentRem,
        minSizeRem,
      ),
      maxSizeRem,
    );

    return css`
      font-size: ${fontSize}rem;
    `;
  }}
`;
