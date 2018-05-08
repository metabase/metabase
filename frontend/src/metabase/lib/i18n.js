import { addLocale, useLocale } from "c-3po";
import { I18NApi } from "metabase/services";

export async function loadLocalization(locale) {
  // load and parse the locale
  const translationsObject = await I18NApi.locale({ locale });
  setLocalization(translationsObject);
}

export function setLocalization(translationsObject) {
  const locale = translationsObject.headers.language;

  addMsgIds(translationsObject);

  // add and set locale with C-3PO
  addLocale(locale, translationsObject);
  useLocale(locale);
}

// we delete msgid property since it's redundant, but have to add it back in to
// make c-3po happy
function addMsgIds(translationsObject) {
  const msgs = translationsObject.translations[""];
  for (const msgid in msgs) {
    if (msgs[msgid].msgid === undefined) {
      msgs[msgid].msgid = msgid;
    }
  }
}
