import {
  type PropsWithChildren,
  createContext,
  useEffect,
  useState,
} from "react";

import { useSetting } from "metabase/common/hooks";
import { setLocaleHeader } from "metabase/lib/api";
import { loadLocalization, setUserLocale } from "metabase/lib/i18n";
import { DatesProvider } from "metabase/ui/components/theme/DatesProvider/DatesProvider";

interface LocaleProviderProps {
  locale?: string | null;
  shouldWaitForLocale?: boolean;
}

/** context for the locale used in the sdk and in public/static from the #locale parameter  */
export const FrontendLocaleContext = createContext<string | null>(null);

export const LocaleProvider = ({
  children,
  locale,
  shouldWaitForLocale,
}: PropsWithChildren<LocaleProviderProps>) => {
  const shouldLoadLocale = Boolean(locale);
  const [isLocaleLoading, setIsLocaleLoading] = useState(shouldLoadLocale);
  const [contextLocale, setContextLocale] = useState<string | null>(null);

  const availableLocalesData = useSetting("available-locales");

  useEffect(() => {
    if (shouldLoadLocale && availableLocalesData) {
      const localeToLoad = getLocaleToUse(
        locale ?? null,
        availableLocalesData.map(([locale]) => locale) ?? [],
      );

      setLocaleHeader(localeToLoad);
      loadLocalization(localeToLoad)
        .then((translatedObject) => {
          setIsLocaleLoading(false);
          setUserLocale(translatedObject);
          setContextLocale(localeToLoad);
        })
        .catch(() => {
          setIsLocaleLoading(false);
        });
    }
  }, [locale, shouldLoadLocale, availableLocalesData]);

  if (shouldWaitForLocale && isLocaleLoading) {
    return null;
  }

  return (
    <FrontendLocaleContext.Provider value={contextLocale}>
      {/* The `DatesProvider` wrapping the app is not re-rendered when the locale changes
      so we need to wrap the children in another `DatesProvider` to ensure the locale is updated */}
      <DatesProvider>
        {/* note: we may show a loader here while loading, this would prevent race
        conditions and things being rendered for some time with the wrong locale
        downside is that it would make the initial load slower */}
        {children}
      </DatesProvider>
    </FrontendLocaleContext.Provider>
  );
};

// Re-implementation of the fallback logic of the backend.
// Should be kept in sync with `fallback-locale` in src/metabase/util/i18n/impl.clj
export const getLocaleToUse = (
  // locale is in the format `en-US` or `zh-TW`
  locale: string | null,
  // availableLocales is an array of strings in the format `en` or `zh_TW`
  // note: the backend uses `_` instead of `-`
  availableLocales: string[],
) => {
  if (!locale) {
    return "en";
  }
  const [language, country] = locale.split("-");

  const normalizedLanguage = language.toLowerCase();
  const normalizedCountry = country?.toUpperCase();

  const normalizedLocale = country
    ? `${normalizedLanguage}_${normalizedCountry}`
    : normalizedLanguage;

  // given a locale aa_BB

  // return the locale aa_BB if it's available
  if (availableLocales.includes(normalizedLocale)) {
    return normalizedLocale;
  }

  // return the `aa` if it's available
  if (availableLocales.includes(normalizedLanguage)) {
    return normalizedLanguage;
  }

  // fallback to the first `aa-XX` locale found, if any
  for (const availableLocale of availableLocales) {
    if (availableLocale.startsWith(normalizedLanguage)) {
      return availableLocale;
    }
  }

  return "en";
};
