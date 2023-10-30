import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import updateLocalePlugin from "dayjs/plugin/updateLocale";

dayjs.extend(customParseFormat);
dayjs.extend(updateLocalePlugin);
