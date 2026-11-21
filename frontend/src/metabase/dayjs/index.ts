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

import parseZone from "./parse-zone-plugin";

export type { Dayjs, OpUnitType, QUnitType } from "dayjs";

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

export { dayjs };

/** Maps a Metabase language code to the name of its dayjs locale. */
export function getDayjsLocale(language = ""): string {
  switch (language) {
    case "zh":
    case "zh-Hans":
      return "zh-cn";
    default:
      return language.toLowerCase();
  }
}

/**
 * Loads a dayjs locale on demand. Each locale is its own lazy chunk, so the main
 * bundle doesn't carry all of them, and a new app locale needs no list update here.
 */
export async function loadDayjsLocale(locale: string): Promise<void> {
  if (isDayjsLocaleLoaded(locale)) {
    return;
  }
  await import(
    /* webpackChunkName: "dayjs-locale-[request]" */
    `dayjs/locale/${locale}.js`
  );
}

export function isDayjsLocaleLoaded(locale: string): boolean {
  return locale in dayjs.Ls;
}
