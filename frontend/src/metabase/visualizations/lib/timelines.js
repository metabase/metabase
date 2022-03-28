import d3 from "d3";
import _ from "underscore";
import { ICON_PATHS } from "metabase/icon_paths";
import { stretchTimeseriesDomain } from "./apply_axis";
import timeseriesScale from "./timeseriesScale";

const ICON_X = -16;
const ICON_Y = 10;
const ICON_SIZE = 16;
const ICON_SCALE = 0.45;
const ICON_GROUP = 24;
const RECT_SIZE = ICON_SIZE * 2;
const TEXT_X = 10;
const TEXT_Y = 16;
const TEXT_DISTANCE = ICON_SIZE * 2;

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

function getEventGroups(events, eventScale) {
  return _.chain(events)
    .groupBy(e => Math.round(eventScale(e.timestamp) / ICON_GROUP))
    .values()
    .value();
}

function getEventPoints(eventGroups, eventScale) {
  return eventGroups.map(
    events =>
      _.chain(events)
        .map(event => eventScale(event.timestamp))
        .reduce((a, b) => a + b, 0)
        .value() / events.length,
  );
}

function isSelected(events, selectedEventIds) {
  return events.some(event => selectedEventIds.includes(event.id));
}

function getIcon(events) {
  return events.length === 1 ? events[0].icon : "star";
}

function getIconPath(events) {
  const icon = getIcon(events);
  return ICON_PATHS[icon].path ?? ICON_PATHS[icon];
}

function getIconFillRule(events) {
  const icon = getIcon(events);
  return ICON_PATHS[icon].attrs?.fillRule;
}

function getIconTransform() {
  return `scale(${ICON_SCALE}) translate(${ICON_X}, ${ICON_Y})`;
}

function getIconLabel(events) {
  const icon = getIcon(events);
  return `${icon} icon`;
}

function isEventWithin(eventIndex, eventPoints, eventDistance) {
  const thisPoint = eventPoints[eventIndex];
  const prevPoint = eventPoints[eventIndex - 1] ?? Number.NEGATIVE_INFINITY;
  const nextPoint = eventPoints[eventIndex + 1] ?? Number.POSITIVE_INFINITY;
  const prevDistance = thisPoint - prevPoint;
  const nextDistance = nextPoint - thisPoint;

  return prevDistance < eventDistance || nextDistance < eventDistance;
}

function hasEventText(events, eventIndex, eventPoints) {
  if (events.length > 1) {
    return !isEventWithin(eventIndex, eventPoints, TEXT_DISTANCE);
  } else {
    return false;
  }
}

function renderEventLines({
  chart,
  brush,
  eventGroups,
  eventPoints,
  selectedEventIds,
}) {
  const eventLines = brush.selectAll(".event-line").data(eventGroups);
  const brushHeight = chart.effectiveHeight();
  eventLines.exit().remove();

  eventLines
    .enter()
    .append("line")
    .attr("class", "event-line")
    .classed("hover", d => isSelected(d, selectedEventIds))
    .attr("x1", (d, i) => eventPoints[i])
    .attr("x2", (d, i) => eventPoints[i])
    .attr("y1", "0")
    .attr("y2", brushHeight);
}

function renderEventTicks({
  axis,
  brush,
  eventGroups,
  eventPoints,
  selectedEventIds,
  onHoverChange,
  onOpenTimelines,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
}) {
  const eventAxis = axis.selectAll(".event-axis").data([eventGroups]);
  const eventLines = brush.selectAll(".event-line").data(eventGroups);
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
    .attr("transform", (d, i) => `translate(${eventPoints[i]}, 0)`);

  eventTicks
    .append("path")
    .attr("class", "event-icon")
    .attr("d", d => getIconPath(d))
    .attr("fill-rule", d => getIconFillRule(d))
    .attr("transform", () => getIconTransform())
    .attr("aria-label", d => getIconLabel(d));

  eventTicks
    .append("rect")
    .attr("fill", "none")
    .attr("width", RECT_SIZE)
    .attr("height", RECT_SIZE)
    .attr("transform", () => getIconTransform());

  eventTicks
    .filter((d, i) => hasEventText(d, i, eventPoints))
    .append("text")
    .attr("class", "event-text")
    .attr("transform", `translate(${TEXT_X},${TEXT_Y})`)
    .text(d => d.length);

  eventTicks
    .on("mousemove", function(d) {
      const eventTick = d3.select(this);
      const eventIcon = eventTicks.filter(data => d === data);
      const eventLine = eventLines.filter(data => d === data);

      onHoverChange({ element: eventIcon.node(), timelineEvents: d });
      eventTick.classed("hover", true);
      eventLine.classed("hover", true);
    })
    .on("mouseleave", function(d) {
      const eventTick = d3.select(this);
      const eventLine = eventLines.filter(data => d === data);

      onHoverChange(null);
      eventTick.classed("hover", isSelected(d, selectedEventIds));
      eventLine.classed("hover", isSelected(d, selectedEventIds));
    })
    .on("click", function(d) {
      onOpenTimelines();

      if (isSelected(d, selectedEventIds)) {
        onDeselectTimelineEvents(d);
      } else {
        onSelectTimelineEvents(d);
      }
    });
}

export function renderEvents(
  chart,
  {
    events = [],
    selectedEventIds = [],
    xDomain = [],
    xInterval = {},
    onHoverChange,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
  },
) {
  const axis = getXAxis(chart);
  const brush = getBrush(chart);
  const eventScale = getEventScale(chart, xDomain, xInterval);
  const eventGroups = getEventGroups(events, eventScale);
  const eventPoints = getEventPoints(eventGroups, eventScale);

  if (brush) {
    renderEventLines({
      chart,
      brush,
      eventGroups,
      eventPoints,
      selectedEventIds,
    });
  }

  if (axis) {
    renderEventTicks({
      axis,
      brush,
      eventGroups,
      eventPoints,
      selectedEventIds,
      onHoverChange,
      onOpenTimelines,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
    });
  }
}

export function hasEventAxis({ timelineEvents = [], isTimeseries }) {
  return isTimeseries && timelineEvents.length > 0;
}
