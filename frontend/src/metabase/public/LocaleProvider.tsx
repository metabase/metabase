import { type PropsWithChildren, useEffect, useState } from "react";

import { setLocaleHeader } from "metabase/lib/api";
import { loadLocalization, setUserLocale } from "metabase/lib/i18n";

import localesData from "../../../../resources/locales.json";

export const LocaleProvider = ({
  children,
  locale,
}: PropsWithChildren<{ locale?: string | null }>) => {
  // The state is not used explicitly, but we need to trigger a re-render when the locale changes
  // as changing the locale in ttag doesn't trigger react components to update
  const [_isLoadingLocale, setIsLoadingLocale] = useState(false);

  useEffect(() => {
    const validatedLocale = getLocaleToUse(locale ?? null, localesData.locales);
    if (validatedLocale) {
      setIsLoadingLocale(true);
      setLocaleHeader(validatedLocale);
      loadLocalization(validatedLocale.replace("-", "_")).then(
        translatedObject => {
          setIsLoadingLocale(false);
          setUserLocale(translatedObject);
        },
      );
    }
  }, [locale]);

  // note: we may show a loader here while loading, this would prevent race
  // conditions and things being rendered for some time with the wrong locale
  // downside is that it would make the initial load slower
  return <>{children}</>;
};

// Re-implementation of the fallback logic of the backend.
// See `fallback-locale` in https://github.com/metabase/metabase/blob/master/src/metabase/util/i18n/impl.clj
// for the original implementation
export const getLocaleToUse = (
  locale: string | null,
  availableLocales: string[],
) => {
  if (!locale) {
    return null;
  }

  // return the locale if it's available
  if (availableLocales.includes(locale)) {
    return locale;
  }

  const [language, _country] = locale.split("-");

  // return the `aa` if it's available
  if (availableLocales.includes(language)) {
    return language;
  }

  // fallback to `aa-XX` if available
  for (const availableLocale of availableLocales) {
    if (availableLocale.startsWith(language)) {
      return availableLocale;
    }
  }

  return null;
};
