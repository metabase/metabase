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
    const validatedLocale = validateLocale(locale, localesData.locales);
    if (locale) {
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
// See https://github.com/metabase/metabase/blob/5197e318d7a6f6d9b9f79bdba134191f2111a680/src/metabase/util/i18n/impl.clj#L93-L105
// for the original implementation
export const validateLocale = (
  locale: string | null | undefined,
  availableLocales: string[],
) => {
  if (!locale) {
    return "en";
  }

  const [language, country] = locale.split("-");

  // perfect match of aa-BB
  if (availableLocales.includes(`${language}-${country}`)) {
    return `${language}-${country}`;
  }

  // perfect match of aa
  if (availableLocales.includes(language)) {
    return language;
  }

  // fallback to aa-XX if available
  for (const availableLocale of availableLocales) {
    if (availableLocale.startsWith(language)) {
      return availableLocale;
    }
  }

  return "en";
};
