import d3 from "d3";
import _ from "underscore";
import { ICON_PATHS } from "metabase/icon_paths";
import { parseTimestamp } from "metabase/lib/time";
import { stretchTimeseriesDomain } from "./apply_axis";
import timeseriesScale from "./timeseriesScale";

const X_AXIS_TICK_EXTRA_MARGIN_TOP = 20;
const EVENT_ICON_OFFSET_X = -16;
const EVENT_ICON_MARGIN_TOP = 10;
const EVENT_GROUP_COUNT_MARGIN_LEFT = 10;
const EVENT_GROUP_COUNT_MARGIN_TOP = EVENT_ICON_MARGIN_TOP + 8;

function getFlatEvents(timelines) {
  return timelines
    .flatMap(timeline => timeline.events)
    .map(event => ({ ...event, timestamp: parseTimestamp(event.timestamp) }));
}

function getDomainEvents(events, [xDomainMin, xDomainMax]) {
  return events.filter(
    event =>
      event.timestamp.isSame(xDomainMin) ||
      event.timestamp.isBetween(xDomainMin, xDomainMax) ||
      event.timestamp.isSame(xDomainMax),
  );
}

function getEventGroups(events, xInterval) {
  return _.groupBy(events, event =>
    event.timestamp
      .clone()
      .startOf(xInterval.interval)
      .valueOf(),
  );
}

function getEventTicks(eventGroups) {
  return Object.keys(eventGroups).map(value => new Date(value));
}

function getTranslateFromStyle(value) {
  const style = value.replace("translate(", "").replace(")", "");
  const [x, y] = style.split(",");
  return [parseFloat(x), parseFloat(y)];
}

function getXAxis(chart) {
  return chart.svg().select(".axis.x");
}

function getEventAxis(xAxis, xDomain, xInterval, eventTicks) {
  const [[xAxisDomainLine]] = xAxis.select("path.domain");
  const { width: axisWidth } = xAxisDomainLine.getBoundingClientRect();

  const scale = timeseriesScale(xInterval)
    .domain(stretchTimeseriesDomain(xDomain, xInterval))
    .range([0, axisWidth]);

  const eventsAxisGenerator = d3.svg
    .axis()
    .scale(scale)
    .orient("bottom")
    .ticks(eventTicks.length)
    .tickValues(eventTicks);

  const eventsAxis = xAxis
    .append("g")
    .attr("class", "events-axis")
    .call(eventsAxisGenerator);

  eventsAxis.select("path.domain").remove();
  return eventsAxis;
}

function renderXAxis(xAxis) {
  xAxis.selectAll(".tick")[0].forEach(tick => {
    const style = tick.getAttribute("transform");
    const [x, y] = getTranslateFromStyle(style);
    tick.setAttribute(
      "transform",
      `translate(${x},${y + X_AXIS_TICK_EXTRA_MARGIN_TOP})`,
    );
  });
}

function renderEventTicks(chart, eventAxis, eventGroups) {
  const brushLayer = chart.svg().select("g.brush");
  const brushLayerHeight = brushLayer.select("rect.background").attr("height");

  Object.values(eventGroups).forEach(group => {
    const defaultTick = eventAxis.select(".tick");
    const transformStyle = defaultTick.attr("transform");
    const [tickX] = getTranslateFromStyle(transformStyle);
    defaultTick.remove();

    const isOnlyOneEvent = group.length === 1;
    const iconName = isOnlyOneEvent ? group[0].icon : "star";

    const iconPath = ICON_PATHS[iconName].path
      ? ICON_PATHS[iconName].path
      : ICON_PATHS[iconName];
    const iconScale = iconName === "mail" ? 0.45 : 0.5;

    brushLayer
      .append("line")
      .attr("class", "event-line")
      .attr("x1", tickX)
      .attr("x2", tickX)
      .attr("y1", "0")
      .attr("y2", brushLayerHeight);

    const eventIconContainer = eventAxis
      .append("g")
      .attr("class", "event-tick")
      .attr("transform", transformStyle);

    eventIconContainer
      .append("path")
      .attr("class", "event-icon")
      .attr("d", iconPath)
      .attr(
        "transform",
        `scale(${iconScale}) translate(${EVENT_ICON_OFFSET_X},${EVENT_ICON_MARGIN_TOP})`,
      );

    if (!isOnlyOneEvent) {
      eventIconContainer
        .append("text")
        .text(group.length)
        .attr(
          "transform",
          `translate(${EVENT_GROUP_COUNT_MARGIN_LEFT},${EVENT_GROUP_COUNT_MARGIN_TOP})`,
        );
    }
  });
}

export function renderEvents(
  chart,
  { timelines, xDomain, xInterval, isTimeseries },
) {
  if (!isTimeseries) {
    return;
  }

  const events = getDomainEvents(getFlatEvents(timelines), xDomain);
  const eventGroups = getEventGroups(events, xInterval);
  const eventTicks = getEventTicks(eventGroups);

  if (!events.length) {
    return;
  }

  const xAxis = getXAxis(chart);
  const eventAxis = getEventAxis(xAxis, xDomain, xInterval, eventTicks);
  renderEventTicks(chart, eventAxis, eventGroups);
  renderXAxis(xAxis);
}
