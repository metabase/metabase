export const getBottomOffset = (
  areXTicksRotated: boolean,
  marginBottom: number,
) => {
  if (!areXTicksRotated) {
    return marginBottom;
  }

  return marginBottom;
};

type CalculateBoundsInput = {
  width: number;
  height: number;
  labelFontSize: number;
  yLabelOffsetLeft: number;
  yLabelOffsetRight: number;
  xTicksHeight: number;
  margin: {
    right: number;
    left: number;
    top: number;
    bottom: number;
  };
};

export const calculateBounds = ({
  width,
  height,
  margin,
  labelFontSize,
  yLabelOffsetLeft,
  yLabelOffsetRight,
  xTicksHeight,
}: CalculateBoundsInput) => {
  const xMin = yLabelOffsetLeft + labelFontSize * 1.5;
  const xMax = width - margin.right - (yLabelOffsetRight + labelFontSize * 1.5);
  const yMax = margin.top;
  const yMin = height - margin.bottom - xTicksHeight;
  const innerWidth = xMax - xMin;
  const innerHeight = yMin - yMax;

  return {
    xMin,
    xMax,
    yMax,
    yMin,
    innerWidth,
    innerHeight,
  };
};
