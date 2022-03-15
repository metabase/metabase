import d3 from "d3";
import moment from "moment-timezone";

// moment-timezone based d3 scale
const timeseriesScale = (
  { count, interval, timezone, shiftDays },
  linear = d3.scale.linear(),
) => {
  // console.log("Scale:", { count, interval, timezone, shiftDays }, linear);
  const scale = x => linear(toInt(x));

  scale.domain = x => {
    if (x === undefined) {
      return firstAndLast(linear.domain()).map(t => moment(t).tz(timezone));
    }
    x = x.map(t => moment(t).tz(timezone)); // ensure we have moment objects
    if (interval === "month") {
      x = domainForEvenlySpacedMonths(x, { interval, timezone });
    }
    linear.domain(x.map(toInt));
    return scale;
  };

  scale.range = x => {
    if (x === undefined) {
      return firstAndLast(linear.range());
    }
    if (interval === "month") {
      x = rangeForEvenlySpacedMonths(x, scale.domain(), { interval, timezone });
    }
    linear.range(x);
    return scale;
  };

  scale.ticks = () =>
    ticksForRange(scale.domain(), { count, timezone, interval, shiftDays });

  scale.copy = () =>
    timeseriesScale({ count, interval, timezone, shiftDays }, linear);

  d3.rebind(scale, linear, "rangeRound", "interpolate", "clamp", "invert");

  return scale;
};

function domainForEvenlySpacedMonths(domain, { timezone, interval }) {
  const ticks = ticksForRange(domain, { count: 1, timezone, interval });
  // if the domain only contains one month, return the domain untouched
  if (ticks.length < 2) {
    return domain;
  }
  return wrapValues(ticks, domain);
}

function rangeForEvenlySpacedMonths(range, domain, { timezone, interval }) {
  const plainScale = d3.scale
    .linear()
    .domain(domain.map(toInt))
    .range(range);
  const ticks = ticksForRange(domain, { count: 1, timezone, interval });
  // if the domain only contains one month, return the range untouched
  if (ticks.length < 2) {
    return range;
  }
  const [start, end] = firstAndLast(ticks).map(t => plainScale(toInt(t)));
  const step = (end - start) / (ticks.length - 1);
  const monthPoints = d3.range(ticks.length).map(i => start + i * step);
  return wrapValues(monthPoints, range);
}

function wrapValues(values, [start, end]) {
  const [firstValue, lastValue] = firstAndLast(values);
  return [
    ...(start < firstValue ? [start] : []),
    ...values,
    ...(lastValue < end ? [end] : []),
  ];
}

function firstAndLast(a) {
  if (a == null || a.length < 2) {
    return a;
  }
  return [a[0], a[a.length - 1]];
}

function ticksForRange([start, end], { count, timezone, interval, shiftDays }) {
  const rangeStart = start.clone().startOf(interval);
  const rangeEnd = end.clone().startOf(interval);

  const ticks = [];
  let tick = rangeStart
    .clone()
    .tz(timezone)
    .add(shiftDays, "days");

  // We want to use "round" ticks for a given interval (unit). If we're
  // creating ticks every 50 years, but and the start of the domain is in 1981
  // we move it be on an even 50-year block. 1981 - (1981 % 50) => 1950;
  const intervalMod = tick.get(interval);
  tick.set(interval, intervalMod - (intervalMod % count));

  while (!tick.isAfter(rangeEnd)) {
    if (!tick.isBefore(rangeStart)) {
      ticks.push(tick);
    }
    tick = tick.clone().add(count, interval);
  }
  return ticks;
}

function toInt(d) {
  return moment.isMoment(d) ? d.valueOf() : moment.isDate(d) ? d.getTime() : d;
}

export default timeseriesScale;
