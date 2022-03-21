import d3 from "d3";
import _ from "underscore";
import { ICON_PATHS } from "metabase/icon_paths";
import { stretchTimeseriesDomain } from "./apply_axis";
import timeseriesScale from "./timeseriesScale";

const ICON_SCALE = 0.45;
const ICON_LARGE_SCALE = 0.35;
const ICON_X = -16;
const ICON_Y = 10;
const TEXT_X = 10;
const TEXT_Y = ICON_Y + 8;
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
    .classed("hover", d => isSelected(d, selectedEventIds))
    .attr("x1", (d, i) => eventScale(eventDates[i]))
    .attr("x2", (d, i) => eventScale(eventDates[i]))
    .attr("y1", "0")
    .attr("y2", brushHeight);
}

function renderEventAxis({
  axis,
  brush,
  eventScale,
  eventDates,
  eventGroups,
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

  eventTicks
    .filter(d => d.length > 1)
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
      eventTick.classed("hover", false);
      eventLine.classed("hover", false);
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
    xDomain,
    xInterval,
    onHoverChange,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
  },
) {
  const axis = getXAxis(chart);
  const brush = getBrush(chart);

  const eventScale = getEventScale(chart, xDomain, xInterval);
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

  if (axis) {
    renderEventAxis({
      axis,
      brush,
      eventScale,
      eventDates,
      eventGroups,
      selectedEventIds,
      onHoverChange,
      onOpenTimelines,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
    });
  }
}

export function hasEventAxis({ timelineEvents = [], xDomain, isTimeseries }) {
  return isTimeseries && timelineEvents.length > 0;
}
