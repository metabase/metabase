export default
`const chart     = dc.barChart(element);
const data      = crossfilter(props.series[0].data.rows);
const dimension = data.dimension(d => d[0]);
const group     = dimension.group().reduceSum(d => d[1]);
chart
  .width(props.width)
  .height(props.height)
  .x(d3.scale.ordinal())
  .xUnits(dc.units.ordinal)
  .brushOn(false)
  .yAxisLabel("This is the Y Axis!")
  .dimension(dimension)
  .group(group)
  .render();
`
