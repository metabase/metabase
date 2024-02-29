import dayjs from "dayjs";
import updateLocalePlugin from "dayjs/plugin/updateLocale";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeekPlugin from "dayjs/plugin/isoWeek";
import quarterOfYearPlugin from "dayjs/plugin/quarterOfYear";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(updateLocalePlugin);
dayjs.extend(customParseFormat);
dayjs.extend(isoWeekPlugin);
dayjs.extend(quarterOfYearPlugin);
dayjs.extend(utc);
dayjs.extend(timezone);
