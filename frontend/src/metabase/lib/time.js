import moment from "moment-timezone";

// only attempt to parse the timezone if we're sure we have one (either Z or ±hh:mm or +-hhmm)
// moment normally interprets the DD in YYYY-MM-DD as an offset :-/
export function parseTimestamp(value, unit) {
  if (moment.isMoment(value)) {
    return value;
  } else if (typeof value === "string" && /(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    return moment.parseZone(value);
  } else if (unit === "year") {
    // workaround for https://github.com/metabase/metabase/issues/1992
    return moment()
      .year(value)
      .startOf("year");
  } else {
    return moment.utc(value);
  }
}

export function parseTime(value) {
  if (moment.isMoment(value)) {
    return value;
  } else if (typeof value === "string") {
    return moment(value, [
      "HH:mm:SS.sssZZ",
      "HH:mm:SS.sss",
      "HH:mm:SS.sss",
      "HH:mm:SS",
      "HH:mm",
    ]);
  } else {
    return moment.utc(value);
  }
}

const ZONES = new Set(moment.tz.names().map(name => moment.tz.zone(name)));

// guesses the timezone based on moment timestamps + utcOffsets
// this is moderately inefficient
export function guessTimezone(values) {
  const candidates = new Set(ZONES);
  for (const value of values) {
    // `zone.untils` are milliseconds since unix epoch
    const ts = value.toDate().getTime();
    // `zone.offsets` are negated `utcOffets`
    const offset = value.utcOffset() * -1;
    for (const zone of candidates) {
      // get the index of first `until` that's larger or equal to `ts`
      const index = findUntilsIndex(ts, zone.untils);
      // if none or not same offset then remove candidate zone
      if (index == null || zone.offsets[index] !== offset) {
        candidates.delete(zone);
      }
    }
    // if no candidates remain, return null
    if (candidates.size === 0) {
      return null;
    }
  }
  // return the first candidate
  for (const zone of candidates) {
    return zone.name;
  }
}

function findUntilsIndex(ts, untils) {
  // NAIVE LINEAR SEARCH:
  // for (let i = 0; i < untils.length; i++) {
  //   if (ts < untils[i]) {
  //     return i;
  //   }
  // }
  // MODIFIED BINARY SEARCH:
  let start = 0;
  let end = untils.length - 1;
  let successor = null;
  while (start <= end) {
    const midpoint = start + Math.floor((end - start) / 2);
    if (untils[midpoint] < ts) {
      start = midpoint + 1;
    } else {
      end = midpoint - 1;
      successor = midpoint;
    }
  }
  return successor;
}
