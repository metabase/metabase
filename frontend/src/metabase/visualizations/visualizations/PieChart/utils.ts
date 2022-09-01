export function getMaxLabelDimension(
  d3Arc: d3.svg.Arc<d3.svg.arc.Arc>,
  slice: d3.svg.arc.Arc,
) {
  // Invalid typing
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const innerRadius = d3Arc.innerRadius()();
  // Invalid typing
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const outerRadius = d3Arc.outerRadius()();
  const donutWidth = outerRadius - innerRadius;

  const arcAngle = slice.startAngle - slice.endAngle;

  // using law of cosines to calculate the arc length
  // c = sqrt(a^2 + b^2﹣2*a*b * cos(arcAngle))
  // where a = b = innerRadius

  const innerRadiusArcDistance = Math.sqrt(
    2 * innerRadius * innerRadius -
      2 * innerRadius * innerRadius * Math.cos(arcAngle),
  );

  return Math.min(innerRadiusArcDistance, donutWidth);
}
