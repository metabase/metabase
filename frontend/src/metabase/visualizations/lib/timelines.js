import _ from "underscore";
import { stretchTimeseriesDomain } from "./apply_axis";
import timeseriesScale from "./timeseriesScale";

function getXAxis(chart) {
  return chart.svg().select(".axis.x");
}

function getBrush(chart) {
  return chart.svg().select(".brush");
}

function getEventScale(axis, xDomain, xInterval) {
  const axisNode = axis.select("path.domain").node();
  const axisBounds = axisNode.getBoundingClientRect();

  return timeseriesScale(xInterval)
    .domain(stretchTimeseriesDomain(xDomain, xInterval))
    .range([0, axisBounds.width]);
}

function getEventMapping(events, xInterval) {
  return _.groupBy(events, event =>
    event.timestamp
      .clone()
      .startOf(xInterval.interval)
      .valueOf(),
  );
}

function getEventKeys(eventMapping) {
  return Object.keys(eventMapping).map(value => new Date(parseInt(value)));
}

function renderEventLines({ brush, eventScale, eventKeys }) {
  const eventLines = brush.selectAll(".event-line").data(eventKeys);
  const brushHeight = brush.select("rect.background").attr("height");

  eventLines
    .enter()
    .append("line")
    .attr("class", "event-line")
    .attr("x1", d => eventScale(d))
    .attr("x2", d => eventScale(d))
    .attr("y1", 0)
    .attr("y2", brushHeight);

  eventLines.exit().remove();
}

export function renderEvents(chart, { events = [], xDomain, xInterval }) {
  const axis = getXAxis(chart);
  const brush = getBrush(chart);

  const eventScale = getEventScale(axis, xDomain, xInterval);
  const eventMapping = getEventMapping(events, xInterval);
  const eventKeys = getEventKeys(eventMapping);

  if (brush) {
    renderEventLines({ brush, eventScale, eventKeys });
  }
}

export function hasEventAxis({ timelineEvents = [], xDomain, isTimeseries }) {
  return isTimeseries && timelineEvents.length > 0;
}
