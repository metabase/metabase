export const WIDTH_ADJUSTMENT_FACTOR = 4;
export const HEIGHT_ADJUSTMENT_FACTOR = 4;
export const MAX_HEIGHT_GRID_SIZE = 10;
export const MIN_SIZE_REM = 2.2;
export const MAX_SIZE_REM = 12;

export type PropsForFontSizeScaling = {
  isDashboard?: boolean;
  gridSize?: { height: number; width: number };
  minGridSize?: { height: number; width: number };
  width?: number;
  height?: number;
  totalNumGridCols?: number;
};

export function computeFontSizeAdjustment({
  isDashboard,
  gridSize: cardGridUnitDimensions,
  minGridSize: minCardGridUnitDimensions,
  width: cardWidthPx,
  height: cardHeightPx,
  totalNumGridCols,
}: PropsForFontSizeScaling): number {
  if (
    !isDashboard ||
    !cardGridUnitDimensions ||
    !minCardGridUnitDimensions ||
    !cardWidthPx ||
    !cardHeightPx ||
    !totalNumGridCols
  ) {
    return 0;
  }

  const { height: gridUnitRows, width: gridUnitCols } = cardGridUnitDimensions;
  const {
    height: minGridUnitRows,
    width: minGridUnitCols,
  } = minCardGridUnitDimensions;
  if (!gridUnitRows || !gridUnitCols || !minGridUnitRows || !minGridUnitCols) {
    return 0;
  }

  // at small viewport widths totalNumGridCols is set to 1, but the dashcard's gridSize.width isn't updated.
  // in that scenario, the dashcard's grid width should be treated as 1 as well because it spans the entire grid
  const cardGridWidth = Math.min(totalNumGridCols, gridUnitCols);

  const widthPxPerGridUnit = cardWidthPx / cardGridWidth;
  const maxCardWidthPx = totalNumGridCols * widthPxPerGridUnit;
  const minCardWidthPx = minGridUnitCols * widthPxPerGridUnit;

  // when the dashcard is at its min width, the `gridWidthAdjustment` value will be 0.
  // as it increases in width, it will increase in value up to `WIDTH_ADJUSTMENT_FACTOR`.
  const cardWidthFractionOfMax = Math.max(
    0,
    (cardWidthPx - minCardWidthPx) / (maxCardWidthPx - minCardWidthPx),
  );
  const gridWidthAdjustmentRem =
    cardWidthFractionOfMax * WIDTH_ADJUSTMENT_FACTOR;

  // Avoid a big height adjustment value for large height, small width cards by using the `dashCardGridWidth` when it is less than the `gridUnitRows`
  const dashCardGridHeight = Math.min(cardGridWidth, gridUnitRows);
  const heightPxPerGridUnit = cardHeightPx / dashCardGridHeight;
  // `MAX_HEIGHT_GRID_SIZE` is approximately the number of grid rows that are visible when browser is fully expanded
  const pseudoMaxCardHeightPx = MAX_HEIGHT_GRID_SIZE * heightPxPerGridUnit;
  const minCardHeightPx = minGridUnitRows * heightPxPerGridUnit;

  // when the dashcard is at its min height, the `gridHeightAdjustment` value will be 0.
  // as it increases in height, it will increase in value up to `HEIGHT_ADJUSTMENT_FACTOR`.
  const cardHeightFractionOfPseudoMax = Math.max(
    0,
    (cardHeightPx - minCardHeightPx) /
      (pseudoMaxCardHeightPx - minCardHeightPx),
  );
  const gridHeightAdjustmentRem =
    cardHeightFractionOfPseudoMax * HEIGHT_ADJUSTMENT_FACTOR;

  return gridWidthAdjustmentRem + gridHeightAdjustmentRem;
}

export function computeFontSize(props: PropsForFontSizeScaling) {
  const fontSizeAdjustment = computeFontSizeAdjustment(props);

  // fail-safe to make sure the font size is within a reasonable range
  const clampedScaledFontSize =
    Math.min(
      Math.max(MIN_SIZE_REM + fontSizeAdjustment, MIN_SIZE_REM),
      MAX_SIZE_REM,
    ) || MIN_SIZE_REM;

  return `${clampedScaledFontSize}rem`;
}
