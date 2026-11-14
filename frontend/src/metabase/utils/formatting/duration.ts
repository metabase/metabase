import { msgid, ngettext, t } from "ttag";

import { dayjs } from "metabase/dayjs";
import type {
  DurationStyle,
  DurationUnit,
  TimeEnabled,
} from "metabase-types/api";

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
  duration_precision?: TimeEnabled;
  number_separators?: string;
};

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

const DURATION_PRECISION_MS: Record<TimeEnabled, number> = {
  minutes: MINUTE_MS,
  seconds: SECOND_MS,
  milliseconds: MILLISECOND_MS,
};

type NarrowDurationUnit = {
  unitMs: number;
  wrapMs: number;
  format: (count: string) => string;
};

const NARROW_DURATION_UNITS: NarrowDurationUnit[] = [
  { unitMs: DAY_MS, wrapMs: Infinity, format: (count) => t`${count}d` },
  { unitMs: HOUR_MS, wrapMs: DAY_MS, format: (count) => t`${count}h` },
  { unitMs: MINUTE_MS, wrapMs: HOUR_MS, format: (count) => t`${count}m` },
  { unitMs: SECOND_MS, wrapMs: MINUTE_MS, format: (count) => t`${count}s` },
  {
    unitMs: MILLISECOND_MS,
    wrapMs: SECOND_MS,
    format: (count) => t`${count}ms`,
  },
];

const INTEGER_FORMATTER = new Intl.NumberFormat("en", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

export function formatDuration(
  value: number,
  {
    duration_unit = "second",
    duration_style = "digital",
    duration_precision = "seconds",
    number_separators = ".,",
  }: FormatDurationOptions = {},
): string {
  const precisionMs = DURATION_PRECISION_MS[duration_precision];
  const totalMs =
    Math.round(
      (Math.abs(value) * DURATION_UNIT_MS[duration_unit]) / precisionMs,
    ) * precisionMs;
  const sign = value < 0 && totalMs > 0 ? "-" : "";
  const [decimalSeparator = ".", groupingSeparator = ""] =
    number_separators.split("");
  const formatted =
    duration_style === "narrow"
      ? formatNarrowDuration(totalMs, precisionMs, groupingSeparator)
      : formatDigitalDuration(totalMs, duration_precision, {
          decimalSeparator,
          groupingSeparator,
        });

  return sign + formatted;
}

function formatDigitalDuration(
  totalMs: number,
  precision: TimeEnabled,
  {
    decimalSeparator,
    groupingSeparator,
  }: { decimalSeparator: string; groupingSeparator: string },
): string {
  const hours = Math.floor(totalMs / HOUR_MS);
  const minutes = Math.floor((totalMs % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((totalMs % MINUTE_MS) / SECOND_MS);
  const milliseconds = totalMs % SECOND_MS;

  const clock = [
    formatInteger(hours, groupingSeparator),
    padDigits(minutes, 2),
    ...(precision === "minutes" ? [] : [padDigits(seconds, 2)]),
  ].join(":");

  return precision === "milliseconds"
    ? clock + decimalSeparator + padDigits(milliseconds, 3)
    : clock;
}

function formatNarrowDuration(
  totalMs: number,
  precisionMs: number,
  groupingSeparator: string,
): string {
  const units = NARROW_DURATION_UNITS.filter(
    ({ unitMs }) => unitMs >= precisionMs,
  );
  const parts = units
    .map(({ unitMs, wrapMs, format }) => ({
      count: Math.floor((totalMs % wrapMs) / unitMs),
      format,
    }))
    .filter(({ count }) => count > 0)
    .map(({ count, format }) =>
      format(formatInteger(count, groupingSeparator)),
    );

  if (parts.length > 0) {
    return parts.join(" ");
  }

  const smallestUnit = units[units.length - 1];
  return smallestUnit.format("0");
}

function formatInteger(value: number, groupingSeparator: string): string {
  return INTEGER_FORMATTER.format(value).replace(/,/g, groupingSeparator);
}

function padDigits(value: number, length: number): string {
  return String(value).padStart(length, "0");
}
