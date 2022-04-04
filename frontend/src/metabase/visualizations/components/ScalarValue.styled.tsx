import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

type ScalarValueProps = {
  isDashboard?: boolean;
  gridSize?: { height: number; width: number };
  minGridSize?: { height: number; width: number };
  width?: number;
  height?: number;
  totalNumGridCols?: number;
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

  font-size: ${props => {
    const MIN_SIZE_REM = 2.2;
    const MAX_SIZE_REM = 12;

    const fontSizeAdjustment = computeFontSizeAdjustment(props);

    // fail-safe to make sure the font size is within a reasonable range
    const clampedScaledFontSize = Math.min(
      Math.max(MIN_SIZE_REM + fontSizeAdjustment, MIN_SIZE_REM),
      MAX_SIZE_REM,
    );

    return `${clampedScaledFontSize}rem`;
  }};
`;

export const WIDTH_ADJUSTMENT_FACTOR = 4;
export const HEIGHT_ADJUSTMENT_FACTOR = 4;
export const MAX_HEIGHT_GRID_SIZE = 10;

export function computeFontSizeAdjustment({
  isDashboard,
  gridSize,
  minGridSize,
  width: widthPx,
  height: heightPx,
  totalNumGridCols,
}: ScalarValueProps): number {
  if (
    !isDashboard ||
    !gridSize ||
    !minGridSize ||
    !widthPx ||
    !heightPx ||
    !totalNumGridCols
  ) {
    return 0;
  }

  const { height: gridSizeHeight, width: gridSizeWidth } = gridSize;
  const { height: minGridSizeHeight, width: minGridSizeWidth } = minGridSize;
  if (
    !gridSizeHeight ||
    !gridSizeWidth ||
    !minGridSizeHeight ||
    !minGridSizeWidth
  ) {
    return 0;
  }

  // at small viewport widths totalNumGridCols is set to 1, but the dashcard's gridSize.width isn't updated.
  // in that scenario, the dashcard's grid width should be treated as 1 as well because it spans the entire grid
  const dashCardGridWidth = Math.min(totalNumGridCols, gridSizeWidth);
  const widthPxPerGridUnit = widthPx / dashCardGridWidth;
  const maxWidthPx = totalNumGridCols * widthPxPerGridUnit;
  // 3 is taken from Scalar's min grid size -- should make it a constant.
  const minWidthPx = minGridSizeWidth * widthPxPerGridUnit;

  // when the dashcard is at its min width, the `gridWidthAdjustment` value will be 0.
  // as it increases in width, it will increase in value up to `WIDTH_ADJUSTMENT_FACTOR`.
  const gridWidthAdjustmentRem = Math.max(
    ((widthPx - minWidthPx) / (maxWidthPx - minWidthPx)) *
      WIDTH_ADJUSTMENT_FACTOR,
    0,
  );

  const heightPxPerGridUnit = heightPx / gridSizeHeight;
  // `MAX_HEIGHT_GRID_SIZE` is approximately the number of grid rows that are visible when browser is fully expanded
  const maxHeightPx = MAX_HEIGHT_GRID_SIZE * heightPxPerGridUnit;
  // 3 is taken from Scalar's min grid size -- should make it a constant.
  const minHeightPx = minGridSizeHeight * heightPxPerGridUnit;

  // when the dashcard is at its min height, the `gridHeightAdjustment` value will be 0.
  // as it increases in height, it will increase in value up to `HEIGHT_ADJUSTMENT_FACTOR`.
  const gridHeightAdjustmentRem = Math.max(
    ((heightPx - minHeightPx) / (maxHeightPx - minHeightPx)) *
      HEIGHT_ADJUSTMENT_FACTOR,
    0,
  );

  return gridWidthAdjustmentRem + gridHeightAdjustmentRem;
}
