import dayjs from "dayjs";
import { msgid, ngettext, t } from "ttag";

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
 * plugin is already extended globally at frontend/src/metabase/utils/dayjs.ts),
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
