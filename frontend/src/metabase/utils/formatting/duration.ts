import { match } from "ts-pattern";
import { c, msgid, ngettext, t } from "ttag";

import { dayjs } from "metabase/dayjs";
import type { DurationStyle, DurationUnit } from "metabase-types/api";

export function duration(milliseconds: number) {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;

  if (milliseconds >= HOUR) {
    const hours = Math.round(milliseconds / HOUR);
    return ngettext(msgid`${hours} hour`, `${hours} hours`, hours);
  }
  if (milliseconds >= MINUTE) {
    const minutes = Math.round(milliseconds / MINUTE);
    return ngettext(msgid`${minutes} minute`, `${minutes} minutes`, minutes);
  }
  const seconds = Math.round(milliseconds / SECOND);

  return ngettext(msgid`${seconds} second`, `${seconds} seconds`, seconds);
}

/**
 * Human-readable duration formatter.
 *
 * Ladder:
 *   < 1s     → "Nms"    (e.g. "750ms")
 *   < 1min   → "N.Ms"   (e.g. "8.4s")
 *   < 1hr    → "Xm Ys"  (e.g. "8m 42s")
 *   ≥ 1hr    → "Xh Ym"  (e.g. "2h 17m")
 *
 * Negative inputs (defensive — e.g. clock skew between FE and DB) clamp to 0ms.
 *
 * Uses dayjs.duration internally for component decomposition (the duration
 * plugin is already extended globally in metabase/dayjs),
 * but NOT its .format("HH:mm:ss") because that produces clock-style output
 * rather than the readable ladder we want.
 */
export function formatDurationLong(durationMs: number): string {
  if (durationMs <= 0) {
    return t`0ms`;
  }
  if (durationMs < 1_000) {
    return t`${Math.round(durationMs)}ms`;
  }
  // Snap to the coarsest precision we display (0.1s) before picking a tier, so a
  // value that rounds up to a boundary is promoted: 59_999ms reads as "1m 0s",
  // never an impossible "60.0s".
  const d = dayjs.duration(Math.round(durationMs / 100) * 100);
  if (d.asMinutes() < 1) {
    return t`${d.asSeconds().toFixed(1)}s`;
  }
  if (d.asHours() < 1) {
    return t`${d.minutes()}m ${d.seconds()}s`;
  }
  // asHours (vs hours()) so very long backfills don't wrap past 24h.
  return t`${Math.floor(d.asHours())}h ${d.minutes()}m`;
}

export type FormatDurationOptions = {
  duration_unit?: DurationUnit;
  duration_style?: DurationStyle;
  duration_precision?: DurationUnit;
  number_separators?: string;
};

export const DEFAULT_DURATION_UNIT: DurationUnit = "second";
export const DEFAULT_DURATION_STYLE: DurationStyle = "digital";
export const DEFAULT_DURATION_PRECISION = "second";
const DEFAULT_NUMBER_SEPARATORS = ".,";

const MILLISECOND_MS = 1;
const SECOND_MS = 1000 * MILLISECOND_MS;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const DURATION_UNIT_MS: Record<DurationUnit, number> = {
  nanosecond: MILLISECOND_MS / 1_000_000,
  microsecond: MILLISECOND_MS / 1_000,
  millisecond: MILLISECOND_MS,
  second: SECOND_MS,
  minute: MINUTE_MS,
  hour: HOUR_MS,
  day: DAY_MS,
  week: WEEK_MS,
};

const DURATION_PRECISIONS = ["minute", "second", "millisecond"] as const;

type DurationPrecision = (typeof DURATION_PRECISIONS)[number];

const DURATION_TICK_STEPS_MS = [
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500].map(
    (count) => count * MILLISECOND_MS,
  ),
  ...[1, 2, 5, 10, 15, 20, 30].map((count) => count * SECOND_MS),
  ...[1, 2, 5, 10, 15, 20, 30].map((count) => count * MINUTE_MS),
  ...[1, 2, 3, 6, 12].map((count) => count * HOUR_MS),
];

const DAY_TICK_FACTORS = [1, 2, 5, 10];

type NarrowDurationUnit = {
  unitMs: number;
  wrapMs: number;
  format: (count: string) => string;
};

const NARROW_DURATION_UNITS: NarrowDurationUnit[] = [
  {
    unitMs: DAY_MS,
    wrapMs: Infinity,
    format: (count) => c("Abbreviation for days. {0} is a number").t`${count}d`,
  },
  {
    unitMs: HOUR_MS,
    wrapMs: DAY_MS,
    format: (count) =>
      c("Abbreviation for hours. {0} is a number").t`${count}h`,
  },
  {
    unitMs: MINUTE_MS,
    wrapMs: HOUR_MS,
    format: (count) =>
      c("Abbreviation for minutes. {0} is a number").t`${count}m`,
  },
  {
    unitMs: SECOND_MS,
    wrapMs: MINUTE_MS,
    format: (count) =>
      c("Abbreviation for seconds. {0} is a number").t`${count}s`,
  },
  {
    unitMs: MILLISECOND_MS,
    wrapMs: SECOND_MS,
    format: (count) =>
      c("Abbreviation for milliseconds. {0} is a number").t`${count}ms`,
  },
];

const INTEGER_FORMATTER = new Intl.NumberFormat("en", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

function getOwn<T>(
  table: Partial<Record<string, T>>,
  key: unknown,
): T | undefined {
  return typeof key === "string" && Object.hasOwn(table, key)
    ? table[key]
    : undefined;
}

function resolveDurationOptions({
  duration_unit,
  duration_style,
  duration_precision,
  number_separators,
}: FormatDurationOptions) {
  const precision =
    DURATION_PRECISIONS.find((precision) => precision === duration_precision) ??
    DEFAULT_DURATION_PRECISION;
  const separators =
    typeof number_separators === "string"
      ? number_separators
      : DEFAULT_NUMBER_SEPARATORS;
  const [decimalSeparator = ".", groupingSeparator = ""] = separators.split("");

  return {
    unitMs:
      getOwn(DURATION_UNIT_MS, duration_unit) ??
      DURATION_UNIT_MS[DEFAULT_DURATION_UNIT],
    style: duration_style === "narrow" ? "narrow" : DEFAULT_DURATION_STYLE,
    precision,
    precisionMs: DURATION_UNIT_MS[precision],
    decimalSeparator,
    groupingSeparator,
  };
}

export function formatDuration(
  value: number,
  options: FormatDurationOptions = {},
): string {
  const {
    unitMs,
    style,
    precision,
    precisionMs,
    decimalSeparator,
    groupingSeparator,
  } = resolveDurationOptions(options);
  const totalMs =
    Math.round((Math.abs(value) * unitMs) / precisionMs) * precisionMs;
  const sign = value < 0 && totalMs > 0 ? "-" : "";
  const formatted =
    style === "narrow"
      ? formatNarrowDuration(totalMs, precisionMs, groupingSeparator)
      : formatDigitalDuration(totalMs, precision, {
          decimalSeparator,
          groupingSeparator,
        });

  return sign + formatted;
}

function formatDigitalDuration(
  totalMs: number,
  precision: DurationPrecision,
  {
    decimalSeparator,
    groupingSeparator,
  }: { decimalSeparator: string; groupingSeparator: string },
): string {
  const hours = formatInteger(Math.floor(totalMs / HOUR_MS), groupingSeparator);
  const minutes = padDigits(Math.floor((totalMs % HOUR_MS) / MINUTE_MS), 2);
  const seconds = padDigits(Math.floor((totalMs % MINUTE_MS) / SECOND_MS), 2);
  const milliseconds = padDigits(totalMs % SECOND_MS, 3);

  return match(precision)
    .with("minute", () => `${hours}:${minutes}`)
    .with("second", () => `${hours}:${minutes}:${seconds}`)
    .with(
      "millisecond",
      () => `${hours}:${minutes}:${seconds}${decimalSeparator}${milliseconds}`,
    )
    .exhaustive();
}

function formatNarrowDuration(
  totalMs: number,
  precisionMs: number,
  groupingSeparator: string,
): string {
  return NARROW_DURATION_UNITS.map(({ unitMs, wrapMs, format }) => ({
    count: Math.floor((totalMs % wrapMs) / unitMs),
    isZeroUnit: totalMs === 0 && unitMs === precisionMs,
    format,
  }))
    .filter(({ count, isZeroUnit }) => count > 0 || isZeroUnit)
    .map(({ count, format }) => format(formatInteger(count, groupingSeparator)))
    .join(" ");
}

function formatInteger(value: number, groupingSeparator: string): string {
  return INTEGER_FORMATTER.format(value).replace(/,/g, groupingSeparator);
}

function padDigits(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

export function getDurationTickInterval(
  span: number,
  maxIntervalCount: number,
  options: FormatDurationOptions = {},
): number {
  const { unitMs, precisionMs } = resolveDurationOptions(options);
  const minStepMs = Math.max((span * unitMs) / maxIntervalCount, precisionMs);
  const stepMs =
    DURATION_TICK_STEPS_MS.find((step) => step >= minStepMs) ??
    getDayTickStepMs(minStepMs);

  return stepMs / unitMs;
}

function getDayTickStepMs(minStepMs: number): number {
  const minDays = Math.max(minStepMs / DAY_MS, 1);
  const magnitude = 10 ** Math.floor(Math.log10(minDays));
  const factor =
    DAY_TICK_FACTORS.find((factor) => factor * magnitude >= minDays) ?? 10;

  return factor * magnitude * DAY_MS;
}
