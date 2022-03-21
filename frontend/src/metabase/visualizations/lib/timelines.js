import _ from "underscore";
import { ICON_PATHS } from "metabase/icon_paths";
import { stretchTimeseriesDomain } from "./apply_axis";
import timeseriesScale from "./timeseriesScale";

const ICON_SCALE = 0.45;
const ICON_LARGE_SCALE = 0.35;
const ICON_X = -16;
const ICON_Y = 10;
const RECT_SIZE = 32;

function getXAxis(chart) {
  return chart.svg().select(".axis.x");
}

function getBrush(chart) {
  return chart.svg().select(".brush");
}

function getEventScale(chart, xDomain, xInterval) {
  return timeseriesScale(xInterval)
    .domain(stretchTimeseriesDomain(xDomain, xInterval))
    .range([0, chart.effectiveWidth()]);
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

function getIcon(events) {
  return events.length === 1 ? events[0].icon : "star";
}

function getIconPath(events) {
  const icon = getIcon(events);
  return ICON_PATHS[icon].path ? ICON_PATHS[icon].path : ICON_PATHS[icon];
}

function getIconTransform(events) {
  const icon = getIcon(events);
  const scale = icon === "mail" ? ICON_LARGE_SCALE : ICON_SCALE;
  return `scale(${scale}) translate(${ICON_X}, ${ICON_Y})`;
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
  eventLines.exit().remove();

  eventLines
    .enter()
    .append("line")
    .attr("class", "event-line")
    .classed("selected", d => isSelected(d, selectedEventIds))
    .attr("x1", (d, i) => eventScale(eventDates[i]))
    .attr("x2", (d, i) => eventScale(eventDates[i]))
    .attr("y1", "0")
    .attr("y2", brushHeight);
}

function renderEventAxis({
  axis,
  eventScale,
  eventDates,
  eventGroups,
  selectedEventIds,
}) {
  const eventAxis = axis.selectAll(".event-axis").data([eventGroups]);
  eventAxis.exit().remove();

  eventAxis
    .enter()
    .append("g")
    .attr("class", "event-axis");

  const eventTicks = eventAxis.selectAll(".event-tick").data(eventGroups);
  eventTicks.exit().remove();

  eventTicks
    .enter()
    .append("g")
    .attr("class", "event-tick")
    .classed("hover", d => isSelected(d, selectedEventIds))
    .attr("transform", (d, i) => `translate(${eventScale(eventDates[i])}, 0)`);

  eventTicks
    .append("path")
    .attr("class", "event-icon")
    .attr("d", d => getIconPath(d))
    .attr("transform", d => getIconTransform(d));

  eventTicks
    .append("rect")
    .attr("fill", "none")
    .attr("width", RECT_SIZE)
    .attr("height", RECT_SIZE)
    .attr("transform", d => getIconTransform(d));
}

export function renderEvents(
  chart,
  { events = [], selectedEventIds, xDomain, xInterval },
) {
  const axis = getXAxis(chart);
  const brush = getBrush(chart);

  const eventScale = getEventScale(chart, xDomain, xInterval);
  const eventMapping = getEventMapping(events, xInterval);
  const eventDates = getEventDates(eventMapping);
  const eventGroups = getEventGroups(eventMapping);

  if (axis) {
    renderEventAxis({
      axis,
      eventScale,
      eventDates,
      eventGroups,
      selectedEventIds,
    });
  }

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
