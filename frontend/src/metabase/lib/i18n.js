import MetabaseSettings from "metabase/lib/settings";

import { addLocale, useLocale } from "c-3po";
import { I18NApi } from "metabase/services";

export async function loadLocalization(locale) {
    // load and parse the locale
    const translationsObject = await I18NApi.locale({ locale });
    setLocalization(translationsObject);
}

export function setLocalization(translationsObject) {
    const locale = window.MetabaseLocalization.headers.language;

    // add and set locale with C-3PO
    addLocale(locale, window.MetabaseLocalization);
    useLocale(locale);
}
