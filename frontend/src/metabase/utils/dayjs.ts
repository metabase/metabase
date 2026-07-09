import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import dayOfYear from "dayjs/plugin/dayOfYear";
import duration from "dayjs/plugin/duration";
import isBetween from "dayjs/plugin/isBetween";
import isoWeekPlugin from "dayjs/plugin/isoWeek";
import localeData from "dayjs/plugin/localeData";
import localizedFormat from "dayjs/plugin/localizedFormat";
import preParsePostFormat from "dayjs/plugin/preParsePostFormat";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import updateLocalePlugin from "dayjs/plugin/updateLocale";
import utc from "dayjs/plugin/utc";
import weekOfYear from "dayjs/plugin/weekOfYear";
import weekday from "dayjs/plugin/weekday";

import parseZone from "./dayjs-parse-zone-plugin";

dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);
dayjs.extend(dayOfYear);
dayjs.extend(isoWeekPlugin);
dayjs.extend(localeData);
dayjs.extend(localizedFormat);
dayjs.extend(quarterOfYear);
dayjs.extend(relativeTime);
dayjs.extend(timezone);
dayjs.extend(updateLocalePlugin);
dayjs.extend(utc);
dayjs.extend(weekday);
dayjs.extend(weekOfYear);
dayjs.extend(parseZone);
dayjs.extend(duration);
dayjs.extend(isBetween);
dayjs.extend(preParsePostFormat);

// NOTE(bench): dirty memoization of dayjs `.format()` on the hot static-viz render path. `.format()`
// is pure for a given instant + utc offset + pattern, so cache by those. Unbounded and locale-blind —
// throwaway experiment only (a real version would scope the cache per render and key on locale).
const _dayjsFormat = (dayjs as any).prototype.format;
const _dayjsFormatCache = new Map<string, string>();
(dayjs as any).prototype.format = function (formatStr?: string) {
  const key = `${this.valueOf()} ${this.utcOffset()} ${formatStr ?? ""}`;
  const cached = _dayjsFormatCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const result = _dayjsFormat.call(this, formatStr);
  _dayjsFormatCache.set(key, result);
  return result;
};
