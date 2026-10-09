import type { Grain, Measure } from "../../spec/types";

export const compileGrain = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return "person_id";
    case "session":
      return "session_id";
    case "event":
      return "event_id";
  }
};

export const grainLabel = (grain: Grain): string =>
  ({ person: "people", session: "sessions", event: "events" })[grain];

export const compileMeasure = (measure: Measure, grain: Grain): string => {
  if (measure.agg === "count") {
    return "count()";
  }
  if (measure.field === undefined) {
    return `uniqExact(${compileGrain(grain)})`;
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(measure.field)) {
    throw new Error(`Invalid measure field: ${measure.field}`);
  }
  const fn = measure.agg === "uniq" ? "uniqExact" : measure.agg;
  return `${fn}(${measure.field})`;
};
