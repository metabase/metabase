import { addLocale, useLocale } from "ttag";
import moment from "moment-timezone";

import MetabaseSettings from "metabase/lib/settings";
import { DAY_OF_WEEK_OPTIONS } from "metabase/lib/date-time";

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
            "": { Metabase: { msgid: "Metabase", msgstr: ["Metabase"] } },
          },
        };
  setLocalization(translationsObject);
}

// Tell Moment.js to use the value of the start-of-week Setting for its current locale
export function updateMomentStartOfWeek() {
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

  moment.updateLocale(moment.locale(), {
    week: {
      // Moment.js dow range Sunday (0) - Saturday (6)
      dow: startOfWeekDayNumber,
    },
  });
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

function setLocalization(translationsObject) {
  const locale = translationsObject.headers.language;

  setLanguage(translationsObject);

  updateMomentLocale(locale);
  updateMomentStartOfWeek(locale);
}

function updateMomentLocale(locale) {
  const momentLocale = mapToMomentLocale(locale);
  try {
    if (momentLocale !== "en") {
      require("moment/locale/" + momentLocale);
    }
    moment.locale(momentLocale);
  } catch (e) {
    console.warn(`Could not set moment locale to ${momentLocale}`);
    moment.locale("en");
  }
}

function mapToMomentLocale(locale = "") {
  switch (locale) {
    case "zh":
    case "zh-Hans":
      return "zh-cn";
    default:
      return locale.toLowerCase();
  }
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
