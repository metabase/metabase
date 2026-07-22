import dayjs from "dayjs";
import type { LocaleData } from "ttag";
import { addLocale, useLocale } from "ttag";

import { DAY_OF_WEEK_OPTIONS } from "metabase/utils/date-time";
import MetabaseSettings from "metabase/utils/settings";
import type { DayOfWeekId } from "metabase-types/api";

export type LocaleDataWithLanguage = LocaleData & {
  headers: { language: string };
};

// Turns a map of thunks into an object whose keys are lazy getters, so `t`-tagged strings stay
// deferred to access time (locale-correct) without a hand-written getter per entry. Keys are
// preserved literally in the type.
export function tmap<T extends Record<string, () => unknown>>(
  thunks: T,
): { readonly [K in keyof T]: ReturnType<T[K]> };
export function tmap(thunks: Record<string, () => unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, thunk] of Object.entries(thunks)) {
    Object.defineProperty(result, key, { get: thunk, enumerable: true });
  }
  return result;
}

// Tell dayjs to use the value of the start-of-week Setting for its current locale
// range Sunday (0) - Saturday (6)
export function updateStartOfWeek(
  startOfWeekDayName: DayOfWeekId | null | undefined,
): void {
  const startOfWeekDay = getStartOfWeekDay(startOfWeekDayName);
  if (startOfWeekDay != null) {
    dayjs.updateLocale(dayjs.locale(), { weekStart: startOfWeekDay });
  }
}

// if the start of week Setting is updated, update the dayjs start of week
MetabaseSettings.on("start-of-week", updateStartOfWeek);

function setLanguage(translationsObject: LocaleDataWithLanguage): void {
  const locale = translationsObject.headers.language;
  addMsgIds(translationsObject);

  // add and set locale with ttag
  addLocale(locale, translationsObject);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLocale(locale);
}

const ARABIC_LOCALES = ["ar", "ar-sa"];

export function setLocalization(
  translationsObject: LocaleDataWithLanguage,
): void {
  const language = translationsObject.headers.language;
  setLanguage(translationsObject);
  updateDayjsLocale(language);
  updateStartOfWeek(MetabaseSettings.get("start-of-week"));

  if (ARABIC_LOCALES.includes(language)) {
    preserveLatinNumbersInDayjsLocale(language);
  }
}

/**
 * Ensures that we consistently use latin numbers in Arabic locales.
 * See https://github.com/metabase/metabase/issues/34271
 */
function preserveLatinNumbersInDayjsLocale(locale: string): void {
  dayjs.updateLocale(locale, {
    // Preserve latin numbers, but still replace commas.
    // See https://github.com/moment/moment/blob/000ac1800e620f770f4eb31b5ae908f6167b0ab2/locale/ar.js#L185
    postformat(string: string) {
      return string.replace(/,/g, "،");
    },
    meridiem: (hour: number) => {
      // https://github.com/iamkun/dayjs/pull/2717#issuecomment-2868626450
      return hour < 12 ? "ص" : "م";
    },
  });
}

function updateDayjsLocale(language: string): void {
  const locale = getLocale(language);

  try {
    if (locale !== "en") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic locale loading
      require(`dayjs/locale/${locale}.js`);
    }
    dayjs.locale(locale);
  } catch (e) {
    console.warn(`Could not set day.js locale to ${locale}`);
    dayjs.locale("en");
  }
}

function getLocale(language = ""): string {
  switch (language) {
    case "zh":
    case "zh-Hans":
      return "zh-cn";
    default:
      return language.toLowerCase();
  }
}

function getStartOfWeekDay(
  startOfWeekDayName: DayOfWeekId | null | undefined,
): number | undefined {
  if (!startOfWeekDayName) {
    return undefined;
  }

  const startOfWeekDayNumber = DAY_OF_WEEK_OPTIONS.findIndex(
    ({ id }) => id === startOfWeekDayName,
  );
  if (startOfWeekDayNumber === -1) {
    return undefined;
  }

  return startOfWeekDayNumber;
}

// The artifact drops each entry's `msgid` field as redundant (it's already the key), but ttag
// wants it back. Every context has to be walked, not just the default one: a string extracted
// with a `msgctxt` (`c("…").t`) lives under that context, and leaving it without a `msgid` breaks
// the locale for every string, not just that one.
type TtagMessage = { msgid?: string };

const isTtagMessage = (value: unknown): value is TtagMessage =>
  typeof value === "object" && value !== null;

function addMsgIds(translationsObject: LocaleDataWithLanguage): void {
  for (const context of Object.values(translationsObject.translations)) {
    for (const [msgid, message] of Object.entries(context)) {
      if (isTtagMessage(message) && message.msgid === undefined) {
        message.msgid = msgid;
      }
    }
  }
}

// Runs `f` with the current language for ttag set to the instance (site) locale rather than the user locale, then
// restores the user locale. This can be used for translating specific strings into the instance language; e.g. for
// parameter values in dashboard text cards that should be translated the same for all users viewing the dashboard.
export function withInstanceLanguage<T>(f: () => T): T {
  if (window.MetabaseSiteLocalization) {
    setLanguage(window.MetabaseSiteLocalization);
  }
  try {
    return f();
  } finally {
    if (window.MetabaseUserLocalization) {
      setLanguage(window.MetabaseUserLocalization);
    }
  }
}

export function siteLocale(): string | undefined {
  if (window.MetabaseSiteLocalization) {
    return window.MetabaseSiteLocalization.headers.language;
  }
  return undefined;
}

// register site locale with ttag, if needed later
if (window.MetabaseSiteLocalization) {
  const translationsObject = window.MetabaseSiteLocalization;
  const locale = translationsObject.headers.language;
  addMsgIds(translationsObject);
  addLocale(locale, translationsObject);
}

// set the initial localization to user locale
if (window.MetabaseUserLocalization) {
  setLocalization(window.MetabaseUserLocalization);
}
