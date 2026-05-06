import api from "metabase/api/legacy-client";
import {
  type LocaleDataWithLanguage,
  setLocalization,
} from "metabase/utils/i18n";

// note this won't refresh strings that are evaluated at load time
export async function loadLocalization(
  locale: string,
): Promise<LocaleDataWithLanguage> {
  // we need to be sure to set the initial localization before loading any files
  // so load metabase/services only when we need it
  // load and parse the locale
  const translationsObject: LocaleDataWithLanguage =
    locale !== "en"
      ? // We don't use I18NApi.locale/the GET helper because those helpers adds custom headers,
        // which will make the browser do the pre-flight request on the SDK.
        // The backend doesn't seem to support pre-flight request on the static assets, but even
        // if it supported them it's more performant to skip the pre-flight request
        await fetch(`${api.basename}/app/locales/${locale}.json`).then(
          (response) => response.json(),
        )
      : // We don't serve en.json. Instead, use this object to fall back to the literals.
        {
          headers: {
            language: "en",
            "plural-forms": "nplurals=2; plural=(n != 1);",
          },
          translations: {
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- Not a user facing string
            "": { Metabase: { msgid: "Metabase", msgstr: ["Metabase"] } },
          },
        };
  setLocalization(translationsObject);

  return translationsObject;
}
