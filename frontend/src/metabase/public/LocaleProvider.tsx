import { type PropsWithChildren, useEffect, useState } from "react";

import { setLocaleHeader } from "metabase/lib/api";
import { loadLocalization, setUserLocale } from "metabase/lib/i18n";

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
      setLocaleHeader(locale);
      loadLocalization(locale)
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
