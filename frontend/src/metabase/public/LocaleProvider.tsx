import { type PropsWithChildren, useEffect, useState } from "react";

import { setLocaleHeader } from "metabase/lib/api";
import { loadLocalization, setUserLocale } from "metabase/lib/i18n";

import localesData from "../../../../resources/locales.json";
interface LocaleProviderProps {
  locale?: string | null;
  shouldWaitForLocale?: boolean;
}

export const LocaleProvider = ({
  children,
  locale,
  shouldWaitForLocale,
}: PropsWithChildren<LocaleProviderProps>) => {
  const shouldLoadLocale = Boolean(locale);
  const [isLocaleLoading, setIsLocaleLoading] = useState(shouldLoadLocale);

  useEffect(() => {
    if (shouldLoadLocale) {
      const validatedLocale = getLocaleToUse(
        locale ?? null,
        localesData.locales,
      );

      setLocaleHeader(locale);
      loadLocalization(validatedLocale!.replace("-", "_"))
        .then(translatedObject => {
          setIsLocaleLoading(false);
          setUserLocale(translatedObject);
        })
        .catch(() => {
          setIsLocaleLoading(false);
        });
    }
  }, [locale, shouldLoadLocale]);

  if (shouldWaitForLocale && isLocaleLoading) {
    return null;
  }

  // note: we may show a loader here while loading, this would prevent race
  // conditions and things being rendered for some time with the wrong locale
  // downside is that it would make the initial load slower
  return children;
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
