export type Point = [number, number];

/**
 * Calculates the length of a chord given the radius of a circle and the central angle.
 * @param radius - The radius of the circle.
 * @param angle - The central angle in radians.
 * @returns The length of the chord.
 */
export const calcChordLength = (radius: number, angle: number): number =>
  Math.sqrt(2 * radius ** 2 * (1 - Math.cos(angle)));

/**
 * Calculates the coordinates of a point on a circle given the radius and angle.
 * @param radius - The radius of the circle.
 * @param angle - The angle in radians.
 * @returns A tuple representing the [x, y] coordinates of the point.
 */
export const getCoordOnCircle = (radius: number, angle: number): Point => [
  radius * Math.sin(angle),
  radius * Math.cos(angle),
];

/**
 * Calculates the intersection points of a circle and a horizontal line.
 * @param radius - The radius of the circle.
 * @param horizontalY - The y-coordinate of the horizontal line.
 * @returns An array of intersection points (empty if no intersection, one point if tangent, two points if intersecting).
 */
export const calcCircleIntersectionByHorizontalLine = (
  radius: number,
  horizontalY: number,
): [] | [Point] | [Point, Point] => {
  const absY = Math.abs(horizontalY);
  if (absY > radius) {
    return [];
  }
  if (absY === radius) {
    return [[0, horizontalY]];
  }

  const x = Math.sqrt(radius ** 2 - horizontalY ** 2);
  return [
    [-x, horizontalY],
    [x, horizontalY],
  ];
};

/**
 * Calculates the coordinates of the horizontal chord in a donut at a given y-coordinate.
 * @param y - The y-coordinate of the horizontal line.
 * @param innerRadius - The inner radius of the donut.
 * @param outerRadius - The outer radius of the donut.
 * @returns A tuple of two points representing the left and right intersections of the chord with the donut.
 * @throws Error if the calculation is invalid.
 */
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

  if (!outerLeft || !outerRight) {
    throw new Error(`Invalid horizontal label y = ${y}`);
  }

  return innerLeft ? [outerLeft, innerLeft] : [outerLeft, outerRight];
};

/**
 * Calculates the maximum length of a rectangle that can fit within a donut section.
 * @param topY - The y-coordinate of the top of the rectangle.
 * @param bottomY - The y-coordinate of the bottom of the rectangle.
 * @param innerRadius - The inner radius of the donut.
 * @param outerRadius - The outer radius of the donut.
 * @returns The maximum length of the rectangle that can fit within the donut section.
 */
const calcMaxRectLengthWithinDonut = (
  topY: number,
  bottomY: number,
  innerRadius: number,
  outerRadius: number,
): number => {
  try {
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

    const leftX = Math.max(topLeft[0], bottomLeft[0]);
    const rightX = Math.min(topRight[0], bottomRight[0]);

    return rightX - leftX;
  } catch {
    console.warn(
      `Could not calculate max rectangle length for innerRadius=${innerRadius} outerRadius=${outerRadius} topY=${topY} bottomY=${bottomY}`,
    );

    return 0;
  }
};

/**
 * Checks if an angle is near the x-axis within a given tolerance.
 * @param angle - The angle to check, in radians.
 * @param tolerance - The tolerance range, in radians. Default is π/8.
 * @returns True if the angle is near the x-axis, false otherwise.
 */
const isNearXAxis = (
  angle: number,
  tolerance: number = Math.PI / 8,
): boolean => {
  const normalizedAngle =
    ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return (
    Math.abs(normalizedAngle - Math.PI / 2) <= tolerance ||
    Math.abs(normalizedAngle - (3 * Math.PI) / 2) <= tolerance
  );
};

/**
 * Calculates the available length for a donut slice label.
 * @param innerRadius - The inner radius of the donut.
 * @param outerRadius - The outer radius of the donut.
 * @param startAngle - The start angle of the slice, in radians.
 * @param endAngle - The end angle of the slice, in radians.
 * @param fontSize - The font size of the label.
 * @param labelPosition - The position of the label, either "horizontal" or "radial".
 * @returns The available length for the label.
 */
export const calcAvailableDonutSliceLabelLength = (
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  fontSize: number,
  labelPosition: "horizontal" | "radial",
): number => {
  const donutThickness = outerRadius - innerRadius;
  if (donutThickness <= 2 * fontSize) {
    return 0;
  }

  if (innerRadius >= outerRadius) {
    console.warn(
      `Outer radius must be bigger than inner. Outer: ${outerRadius} inner: ${innerRadius}`,
    );

    return 0;
  }

  const arcAngle = endAngle - startAngle;
  const innerCordLength = calcChordLength(innerRadius, arcAngle);

  if (labelPosition === "radial") {
    return innerCordLength > fontSize ? donutThickness : 0;
  }

  const midRadius = (innerRadius + outerRadius) / 2;
  const midAngle = (startAngle + endAngle) / 2;
  const [, sliceCenterY] = getCoordOnCircle(midRadius, midAngle);

  const labelTopY = sliceCenterY - fontSize;
  const labelBottomY = sliceCenterY + fontSize;
  const maxRectLength = calcMaxRectLengthWithinDonut(
    labelTopY,
    labelBottomY,
    innerRadius,
    outerRadius,
  );

  const cordLengthLimit =
    arcAngle < Math.PI ? innerCordLength : 2 * innerRadius;
  const sliceConstraint =
    isNearXAxis(midAngle) && innerCordLength > fontSize
      ? donutThickness
      : cordLengthLimit;

  return Math.min(maxRectLength, sliceConstraint);
};

/**
 * Calculates the inner and outer radiuses for a specific ring in a multi-ring donut chart.
 * @param innerRadius - The inner radius of the entire donut.
 * @param outerRadius - The outer radius of the entire donut.
 * @param numRings - The total number of rings in the donut.
 * @param ring - The index of the current ring (1-based).
 * @returns An object containing the inner and outer radiuses for the specified ring.
 */
export const calcInnerOuterRadiusesForRing = (
  innerRadius: number,
  outerRadius: number,
  numRings: number,
  ring: number,
): { inner: number; outer: number } => {
  const donutWidth = (outerRadius - innerRadius) / numRings;
  return {
    inner: innerRadius + donutWidth * (ring - 1),
    outer: innerRadius + donutWidth * ring,
  };
};
