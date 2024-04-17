import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import dayOfYear from "dayjs/plugin/dayOfYear";
import isoWeekPlugin from "dayjs/plugin/isoWeek";
import localeData from "dayjs/plugin/localeData";
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
dayjs.extend(quarterOfYear);
dayjs.extend(relativeTime);
dayjs.extend(timezone);
dayjs.extend(updateLocalePlugin);
dayjs.extend(utc);
dayjs.extend(weekday);
dayjs.extend(weekOfYear);
dayjs.extend(parseZone);
