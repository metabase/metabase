// PROTOTYPE: chart colors playground. The link between charts and the panel.
//
// - Charts pass their computed settings through `applyColorOverrides`. It
//   finds every color in them, reports those to the panel, and swaps in the
//   colors the panel has changed.
// - The panel publishes its changes with `setColorOverrides`, keyed by the
//   shipped color, so one palette color moves together in every chart.
//
// No Leva import here: charts load this file, only the app loads the panel.

import Color from "color";
import { useSyncExternalStore } from "react";

export type Hsl = { h: number; s: number; l: number };

export type ChartColor = {
  /** The shipped color, as uppercase `#RRGGBB`. */
  hex: string;
  /** Series, slices or settings drawn with it. */
  usedBy: string[];
};

/** Shipped hex → the color to draw instead. Holds changed colors only. */
export type ColorOverrides = ReadonlyMap<string, Hsl>;

const NO_OVERRIDES: ColorOverrides = new Map();

const COLOR_STRING =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\(.+\))$/i;

// The computed settings already carry these colors under another key
// (`series_settings.colors`, `pie.rows`), so listing them again would show
// stale entries for series that are no longer in the chart.
const UNLISTED_ROOTS = new Set([
  "series_settings",
  "pie.colors",
  "graph.colors",
]);

const MAX_DEPTH = 8;

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const overridesStore = createStore<ColorOverrides>(NO_OVERRIDES);
const chartColorsStore = createStore<ChartColor[]>([]);
const colorsByChart = new Map<object, Map<string, Set<string>>>();

export function setColorOverrides(overrides: ColorOverrides) {
  overridesStore.set(overrides.size === 0 ? NO_OVERRIDES : overrides);
}

/** The panel's current changes. Re-renders the caller when they change. */
export function useColorOverrides(): ColorOverrides {
  return useSyncExternalStore(overridesStore.subscribe, overridesStore.get);
}

/** Every color of the charts on screen, in the order they were found. */
export function useChartColors(): ChartColor[] {
  return useSyncExternalStore(chartColorsStore.subscribe, chartColorsStore.get);
}

export function toHsl(color: string): Hsl {
  const hsl = Color(color).hsl();
  return {
    h: Math.round(hsl.hue()) % 360,
    s: Math.round(hsl.saturationl()),
    l: Math.round(hsl.lightness()),
  };
}

export function toHex({ h, s, l }: Hsl): string {
  return Color.hsl(h, s, l).hex();
}

function parseColor(value: string) {
  if (!COLOR_STRING.test(value)) {
    return null;
  }
  try {
    return Color(value);
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function getLabel(
  path: string[],
  key: string,
  parent: Record<string, unknown> | null,
): string {
  if (path.length === 1 && path[0] === "series_settings.colors") {
    return key;
  }
  if (key === "color" && typeof parent?.name === "string" && parent.name) {
    return parent.name;
  }
  return [...path, key].join(" › ");
}

type Walk = {
  overrides: ColorOverrides;
  found: Map<string, Set<string>>;
  hasSeriesColors: boolean;
};

function replaceColor(
  value: string,
  label: string,
  isListed: boolean,
  walk: Walk,
): string {
  const color = parseColor(value);
  if (!color) {
    return value;
  }
  const hex = color.hex().toUpperCase();
  if (isListed) {
    const labels = walk.found.get(hex) ?? new Set();
    labels.add(label);
    walk.found.set(hex, labels);
  }
  const override = walk.overrides.get(hex);
  if (!override) {
    return value;
  }
  const replaced = Color.hsl(override.h, override.s, override.l).alpha(
    color.alpha(),
  );
  return color.alpha() < 1 ? replaced.hexa() : replaced.hex();
}

function isListedPath(path: string[], key: string, walk: Walk) {
  const root = path[0] ?? key;
  return !(UNLISTED_ROOTS.has(root) && walk.hasSeriesColors);
}

/** Returns `value` itself when nothing under it changed, so memoized charts don't recompute. */
function replaceColors(
  value: unknown,
  path: string[],
  key: string,
  parent: Record<string, unknown> | null,
  walk: Walk,
): unknown {
  if (typeof value === "string") {
    return replaceColor(
      value,
      getLabel(path, key, parent),
      isListedPath(path, key, walk),
      walk,
    );
  }
  if (path.length >= MAX_DEPTH) {
    return value;
  }
  const childPath = [...path, key];
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    const next = items.map((item, index) =>
      replaceColors(item, childPath, String(index), null, walk),
    );
    return next.some((item, index) => item !== items[index]) ? next : value;
  }
  if (isPlainObject(value)) {
    return replaceColorsInObject(value, childPath, walk);
  }
  return value;
}

function replaceColorsInObject(
  object: Record<string, unknown>,
  path: string[],
  walk: Walk,
): Record<string, unknown> {
  let next = object;
  for (const [key, child] of Object.entries(object)) {
    const replaced = replaceColors(child, path, key, object, walk);
    if (replaced !== child) {
      next = next === object ? { ...object } : next;
      next[key] = replaced;
    }
  }
  return next;
}

function publishChartColors() {
  const merged = new Map<string, Set<string>>();
  for (const found of colorsByChart.values()) {
    for (const [hex, labels] of found) {
      const all = merged.get(hex) ?? new Set();
      labels.forEach((label) => all.add(label));
      merged.set(hex, all);
    }
  }
  const next = [...merged].map(([hex, labels]) => ({
    hex,
    usedBy: [...labels],
  }));
  if (JSON.stringify(next) !== JSON.stringify(chartColorsStore.get())) {
    chartColorsStore.set(next);
  }
}

type Applied = { settings: object; overrides: ColorOverrides; result: object };
const appliedByChart = new WeakMap<object, Applied>();

/**
 * A chart's computed settings with the panel's colors swapped in. Also tells
 * the panel which colors the chart uses. Returns `settings` itself when the
 * panel changed none of them.
 *
 * @param chart identifies the chart across renders (the component instance)
 */
export function applyColorOverrides<T extends object>(
  settings: T,
  overrides: ColorOverrides,
  chart: object,
): T {
  const applied = appliedByChart.get(chart);
  if (applied?.settings === settings && applied.overrides === overrides) {
    // `result` was built from this same `settings` object, so it has its type.
    return applied.result as T;
  }

  const walk: Walk = {
    overrides,
    found: new Map(),
    hasSeriesColors:
      "series_settings.colors" in settings || "pie.rows" in settings,
  };
  const result = isPlainObject(settings)
    ? replaceColorsInObject(settings, [], walk)
    : settings;
  appliedByChart.set(chart, { settings, overrides, result });

  // Deferred: this runs while the chart renders, and publishing re-renders the panel.
  queueMicrotask(() => {
    colorsByChart.set(chart, walk.found);
    publishChartColors();
  });

  // A copy of `settings` with only color strings replaced.
  return result as T;
}

/** Call when the chart unmounts, so its colors leave the panel. */
export function forgetChartColors(chart: object) {
  queueMicrotask(() => {
    colorsByChart.delete(chart);
    publishChartColors();
  });
}
