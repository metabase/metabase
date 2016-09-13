export default
`const margin = {top: 20, right: 20, bottom: 30, left: 40},
  width = props.width - margin.left - margin.right,
  height = props.height - margin.top - margin.bottom;

const x = d3.scale.ordinal()
  .rangeRoundBands([0, width], .1);

const y = d3.scale.linear()
  .range([height, 0]);

const xAxis = d3.svg.axis()
  .scale(x)
  .orient("bottom");

const yAxis = d3.svg.axis()
  .scale(y)
  .orient("left")
  .ticks(10);

const svg = d3.select(element).append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

const data = props.series[0].data.rows;

x.domain(data.map(d => d[0]));
y.domain([0, d3.max(data, d => d[1])]);

svg.append("g")
  .attr("class", "x axis")
  .attr("transform", "translate(0," + height + ")")
  .call(xAxis);

svg.append("g")
  .attr("class", "y axis")
  .call(yAxis)
.append("text")
  .attr("transform", "rotate(-90)")
  .attr("y", 6)
  .attr("dy", ".71em")
  .style("text-anchor", "end")
  .text("Frequency");

svg.selectAll(".bar")
  .data(data)
.enter().append("rect")
  .attr("class", "bar")
  .attr("fill", "steelblue")
  .attr("x", d => x(d[0]))
  .attr("width", x.rangeBand())
  .attr("y", d => y(d[1]))
  .attr("height", d => height - y(d[1]));
`
