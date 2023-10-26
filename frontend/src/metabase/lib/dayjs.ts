import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import localeDataPlugin from "dayjs/plugin/localeData";
import updateLocalePlugin from "dayjs/plugin/updateLocale";

dayjs.extend(customParseFormat);
dayjs.extend(localeDataPlugin);
dayjs.extend(updateLocalePlugin);
