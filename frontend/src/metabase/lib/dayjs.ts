import dayjs from "dayjs";
import localeDataPlugin from "dayjs/plugin/localeData";
import updateLocalePlugin from "dayjs/plugin/updateLocale";

dayjs.extend(localeDataPlugin);
dayjs.extend(updateLocalePlugin);
