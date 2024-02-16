import dayjs from "dayjs";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { addLocale, useLocale } from "ttag";

import { DAY_OF_WEEK_OPTIONS } from "metabase/lib/date-time";
import MetabaseSettings from "metabase/lib/settings";

// note this won't refresh strings that are evaluated at load time
export async function loadLocalization(locale) {
  // we need to be sure to set the initial localization before loading any files
  // so load metabase/services only when we need it
  const { I18NApi } = require("metabase/services");
  // load and parse the locale
  const translationsObject =
    locale !== "en"
      ? await I18NApi.locale({ locale })
      : // We don't serve en.json. Instead, use this object to fall back to theliterals.
        {
          headers: {
            language: "en",
            "plural-forms": "nplurals=2; plural=(n != 1);",
          },
          translations: {
            // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
            "": { Metabase: { msgid: "Metabase", msgstr: ["Metabase"] } },
          },
        };
  setLocalization(translationsObject);
}

// Tell moment.js to use the value of the start-of-week Setting for its current locale
// Moment.js dow range Sunday (0) - Saturday (6)
export function updateMomentStartOfWeek() {
  const startOfWeekDay = getStartOfWeekDay();
  if (startOfWeekDay != null) {
    moment.updateLocale(moment.locale(), { week: { dow: startOfWeekDay } });
  }
}

export function updateDayjsStartOfWeek() {
  const startOfWeekDay = getStartOfWeekDay();
  if (startOfWeekDay != null) {
    dayjs.updateLocale(dayjs.locale(), { weekStart: startOfWeekDay });
  }
}

// if the start of week Setting is updated, update the moment start of week
MetabaseSettings.on("start-of-week", updateMomentStartOfWeek);

function setLanguage(translationsObject) {
  const locale = translationsObject.headers.language;
  addMsgIds(translationsObject);

  // add and set locale with ttag
  addLocale(locale, translationsObject);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLocale(locale);
}

const ARABIC_LOCALES = ["ar", "ar-sa"];

export function setLocalization(translationsObject) {
  const language = translationsObject.headers.language;
  setLanguage(translationsObject);
  updateMomentLocale(language);
  updateDayjsLocale(language);
  updateMomentStartOfWeek();
  updateDayjsStartOfWeek();

  if (ARABIC_LOCALES.includes(language)) {
    preverseLatinNumbersInMomentLocale(language);
  }
}

function updateMomentLocale(language) {
  const locale = getLocale(language);

  try {
    if (locale !== "en") {
      require(`moment/locale/${locale}.js`);
    }
    moment.locale(locale);
  } catch (e) {
    console.warn(`Could not set moment.js locale to ${locale}`);
    moment.locale("en");
  }
}

/**
 * Ensures that we consistently use latin numbers in Arabic locales.
 * See https://github.com/metabase/metabase/issues/34271
 */
function preverseLatinNumbersInMomentLocale(locale) {
  moment.updateLocale(locale, {
    // Preserve latin numbers, but still replace commas.
    // See https://github.com/moment/moment/blob/000ac1800e620f770f4eb31b5ae908f6167b0ab2/locale/ar.js#L185
    postformat: string =>
      string.replace(/\d/g, match => match).replace(/,/g, "،"),
  });
}

function updateDayjsLocale(language) {
  const locale = getLocale(language);

  try {
    if (locale !== "en") {
      require(`dayjs/locale/${locale}.js`);
    }
    dayjs.locale(locale);
  } catch (e) {
    console.warn(`Could not set day.js locale to ${locale}`);
    dayjs.locale("en");
  }
}

function getLocale(language = "") {
  switch (language) {
    case "zh":
    case "zh-Hans":
      return "zh-cn";
    default:
      return language.toLowerCase();
  }
}

function getStartOfWeekDay() {
  const startOfWeekDayName = MetabaseSettings.get("start-of-week");
  if (!startOfWeekDayName) {
    return;
  }

  const startOfWeekDayNumber = DAY_OF_WEEK_OPTIONS.findIndex(
    ({ id }) => id === startOfWeekDayName,
  );
  if (startOfWeekDayNumber === -1) {
    return;
  }

  return startOfWeekDayNumber;
}

// we delete msgid property since it's redundant, but have to add it back in to
// make ttag happy
function addMsgIds(translationsObject) {
  const msgs = translationsObject.translations[""];
  for (const msgid in msgs) {
    if (msgs[msgid].msgid === undefined) {
      msgs[msgid].msgid = msgid;
    }
  }
}

// Runs `f` with the current language for ttag set to the instance (site) locale rather than the user locale, then
// restores the user locale. This can be used for translating specific strings into the instance language; e.g. for
// parameter values in dashboard text cards that should be translated the same for all users viewing the dashboard.
export function withInstanceLanguage(f) {
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

export function siteLocale() {
  if (window.MetabaseSiteLocalization) {
    return window.MetabaseSiteLocalization.headers.language;
  }
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
