type Point = [number, number];

const calcChordLength = (radius: number, angle: number) =>
  Math.sqrt(
    2 * Math.pow(radius, 2) - 2 * Math.pow(radius, 2) * Math.cos(angle),
  );

const getCoordOnCircle = (radius: number, angle: number): Point => [
  radius * Math.sin(angle),
  radius * Math.cos(angle),
];

const calcCircleIntersectionByHorizontalLine = (
  radius: number,
  horizontalY: number,
): [] | [Point] | [Point, Point] => {
  // No intersection
  if (Math.abs(horizontalY) > radius) {
    return [];
  }

  // Tangent
  if (Math.abs(horizontalY) === radius) {
    return [[0, horizontalY]];
  }

  const x = Math.sqrt(radius * radius - horizontalY * horizontalY);
  return [
    [-x, horizontalY],
    [x, horizontalY],
  ];
};

const getDonutHorizontalChordCoords = (
  y: number,
  innerRadius: number,
  outerRadius: number,
): [Point, Point] => {
  const [innerLeft] = calcCircleIntersectionByHorizontalLine(innerRadius, y);
  const [outerLeft, outerRight] = calcCircleIntersectionByHorizontalLine(
    outerRadius,
    y,
  );

  if (outerLeft == null || outerRight == null) {
    throw Error(`Invalid horizontal label y = ${y}`);
  }

  if (!innerLeft) {
    return [outerLeft, outerRight];
  }

  return [outerLeft, innerLeft];
};

const calcMaxRectLengthWithinDonut = (
  topY: number,
  bottomY: number,
  innerRadius: number,
  outerRadius: number,
): number => {
  const [topLeft, topRight] = getDonutHorizontalChordCoords(
    topY,
    innerRadius,
    outerRadius,
  );
  const [bottomLeft, bottomRight] = getDonutHorizontalChordCoords(
    bottomY,
    innerRadius,
    outerRadius,
  );

  const leftX = Math.max(topLeft[0], bottomLeft[0]); // most right point of left ones
  const rightX = Math.min(topRight[0], bottomRight[0]); // most left point of right ones

  return rightX - leftX;
};

const isNearXAxis = (angle: number, tolerance: number = Math.PI / 8) => {
  angle = angle % (2 * Math.PI);
  if (angle < 0) {
    angle += 2 * Math.PI;
  }

  return (
    Math.abs(angle - Math.PI / 2) <= tolerance ||
    Math.abs(angle - (3 * Math.PI) / 2) <= tolerance
  );
};

export const calcAvailableDonutSliceLabelLength = (
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  fontSize: number,
  labelPosition: "horizontal" | "radial",
) => {
  if (innerRadius >= outerRadius) {
    throw new Error(
      `Outer radius must be bigger than inner. Outer: ${outerRadius} inner: ${innerRadius}`,
    );
  }

  const donutThickness = outerRadius - innerRadius;
  const arcAngle = endAngle - startAngle;
  const innerCordLength = calcChordLength(innerRadius, arcAngle);

  if (labelPosition === "radial") {
    return innerCordLength > fontSize ? donutThickness : 0;
  }

  const midRadius = (innerRadius + outerRadius) / 2;
  const midAngle = (startAngle + endAngle) / 2;

  const [_, sliceCenterY] = getCoordOnCircle(midRadius, midAngle);

  const labelTopY = sliceCenterY - fontSize;
  const labelBottomY = sliceCenterY + fontSize;
  const maxRectLength = calcMaxRectLengthWithinDonut(
    labelTopY,
    labelBottomY,
    innerRadius,
    outerRadius,
  );

  let sliceConstraint = Infinity;
  if (arcAngle < Math.PI) {
    sliceConstraint =
      isNearXAxis(midAngle) && innerCordLength > fontSize
        ? donutThickness
        : innerCordLength;
  }

  return Math.min(maxRectLength, sliceConstraint);
};

export const calcInnerOuterRadiusesForRing = (
  innerRadius: number,
  outerRadius: number,
  numRings: number,
  ring: number,
) => {
  const donutWidth = (outerRadius - innerRadius) / numRings;
  return {
    inner: innerRadius + donutWidth * (ring - 1),
    outer: innerRadius + donutWidth * ring,
  };
};
