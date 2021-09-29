import { addLocale, useLocale } from "ttag";
import moment from "moment-timezone";

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
            "": { Metabase: { msgid: "Metabase", msgstr: ["Metabase"] } },
          },
        };
  setLocalization(translationsObject);
}

// Tell Moment.js to use the value of the start-of-week Setting for its current locale
function updateMomentStartOfWeek() {
  const startOfWeekDayName = MetabaseSettings.get("start-of-week");
  if (!startOfWeekDayName) {
    return;
  }

  const START_OF_WEEK_DAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  const startOfWeekDayNumber = START_OF_WEEK_DAYS.indexOf(startOfWeekDayName);
  if (startOfWeekDayNumber === -1) {
    return;
  }
  console.log(
    "Setting moment.js start of week for Locale",
    moment.locale(),
    "to",
    startOfWeekDayName,
  );

  moment.updateLocale(moment.locale(), {
    week: {
      // Moment.js dow range Sunday (0) - Saturday (6)
      dow: startOfWeekDayNumber,
    },
  });
}

// if the start of week Setting is updated, update the moment start of week
MetabaseSettings.on("start-of-week", updateMomentStartOfWeek);

export function setLocalization(translationsObject) {
  const locale = translationsObject.headers.language;

  addMsgIds(translationsObject);

  // add and set locale with C-3PO
  addLocale(locale, translationsObject);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLocale(locale);

  moment.locale(locale);
  updateMomentStartOfWeek(locale);
}

// Format a fixed timestamp in local time to see if the current locale defaults
// to using a 24 hour clock.
export function isLocale24Hour() {
  const formattedTime = moment("2000-01-01T13:00:00").format("LT");
  return /^13:/.test(formattedTime);
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

// set the initial localization
if (window.MetabaseLocalization) {
  setLocalization(window.MetabaseLocalization);
}
