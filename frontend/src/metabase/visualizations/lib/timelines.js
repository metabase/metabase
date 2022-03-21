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
  const axisNode = axis.select(".domain").node();
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

function getEventDates(eventMapping) {
  return Object.keys(eventMapping).map(value => new Date(parseInt(value)));
}

function getEventGroups(eventMapping) {
  return Object.values(eventMapping);
}

function isSelected(events, selectedEventIds) {
  return events.some(event => selectedEventIds.includes(event.id));
}

function renderEventLines({
  brush,
  eventScale,
  eventDates,
  eventGroups,
  selectedEventIds,
}) {
  const eventLines = brush.selectAll(".event-line").data(eventGroups);
  const brushHeight = brush.select(".background").attr("height");

  eventLines
    .enter()
    .append("line")
    .attr("class", "event-line")
    .classed("selected", d => isSelected(d, selectedEventIds))
    .attr("x1", (d, i) => eventScale(eventDates[i]))
    .attr("x2", (d, i) => eventScale(eventDates[i]))
    .attr("y1", "0")
    .attr("y2", brushHeight);

  eventLines.exit().remove();
}

export function renderEvents(
  chart,
  { events = [], selectedEventIds, xDomain, xInterval },
) {
  const axis = getXAxis(chart);
  const brush = getBrush(chart);

  const eventScale = getEventScale(axis, xDomain, xInterval);
  const eventMapping = getEventMapping(events, xInterval);
  const eventDates = getEventDates(eventMapping);
  const eventGroups = getEventGroups(eventMapping);

  if (brush) {
    renderEventLines({
      brush,
      eventScale,
      eventDates,
      eventGroups,
      selectedEventIds,
    });
  }
}

export function hasEventAxis({ timelineEvents = [], xDomain, isTimeseries }) {
  return isTimeseries && timelineEvents.length > 0;
}
