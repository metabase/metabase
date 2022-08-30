export function getMaxLabelDimension(
  d3Arc: d3.svg.Arc<d3.svg.arc.Arc>,
  slice: d3.svg.arc.Arc,
) {
  const index = 0;
  const innerRadius = d3Arc.innerRadius()(slice, index);
  const outerRadius = d3Arc.outerRadius()(slice, index);
  const donutWidth = outerRadius - innerRadius;

  const arcAngle =
    d3Arc.startAngle()(slice, index) - d3Arc.endAngle()(slice, index);

  // using law of cosines to calculate the arc length
  // c = sqrt(a^2 + b^2﹣2*a*b * cos(arcAngle))
  // where a = b = innerRadius

  const innerRadiusArcDistance = Math.sqrt(
    2 * innerRadius * innerRadius -
      2 * innerRadius * innerRadius * Math.cos(arcAngle),
  );

  return Math.min(innerRadiusArcDistance, donutWidth);
}
