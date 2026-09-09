import type { CardDisplayType } from "metabase-types/api";

import type { Candidate, Channel, ColumnProfile } from "./types";

export type ProfileLookup = Map<number, ColumnProfile>;

export function profileLookup(profiles: ColumnProfile[]): ProfileLookup {
  return new Map(profiles.map((profile) => [profile.index, profile]));
}

export const ALL_CHANNELS: readonly Channel[] = [
  "x",
  "series",
  "metrics",
  "bubble",
  "lat",
  "lon",
  "region",
  "source",
  "target",
  "value",
  "pivotRows",
  "pivotColumns",
  "scalarField",
  "grouping",
  "subGrouping",
];

export const AXIS_CHANNELS: readonly Channel[] = [
  "x",
  "series",
  "region",
  "lat",
  "lon",
  "source",
  "target",
  "grouping",
  "subGrouping",
  "pivotRows",
  "pivotColumns",
];

export const MEASURE_CHANNELS: readonly Channel[] = [
  "metrics",
  "bubble",
  "value",
  "scalarField",
];

const CARTESIAN_DISPLAYS: readonly CardDisplayType[] = [
  "line",
  "area",
  "bar",
  "row",
  "combo",
];

const TIMESERIES_DISPLAYS: readonly CardDisplayType[] = ["line", "area"];

export function isCartesian(display: CardDisplayType): boolean {
  return CARTESIAN_DISPLAYS.includes(display);
}

export function isTimeseriesDisplay(display: CardDisplayType): boolean {
  return TIMESERIES_DISPLAYS.includes(display);
}

export function isTableLike(display: CardDisplayType): boolean {
  return display === "table" || display === "object";
}

export function mapped(
  candidate: Candidate,
  channel: Channel,
  lookup: ProfileLookup,
): ColumnProfile[] {
  return (candidate.mapping[channel] ?? [])
    .map((index) => lookup.get(index))
    .filter((profile): profile is ColumnProfile => profile != null);
}

export function firstMapped(
  candidate: Candidate,
  channel: Channel,
  lookup: ProfileLookup,
): ColumnProfile | null {
  return mapped(candidate, channel, lookup)[0] ?? null;
}

export function mappedOn(
  candidate: Candidate,
  channels: readonly Channel[],
  lookup: ProfileLookup,
): ColumnProfile[] {
  return channels.flatMap((channel) => mapped(candidate, channel, lookup));
}

export function isStackedVariant(candidate: Candidate): boolean {
  return candidate.variant === "stacked" || candidate.variant === "normalized";
}
