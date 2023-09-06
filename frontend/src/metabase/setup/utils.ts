import _ from "underscore";
import type { LocaleData } from "metabase-types/api";
import type { Locale } from "metabase-types/store";

export const getLocales = (
  localeData: LocaleData[] = [["en", "English"]],
): Locale[] => {
  return _.chain(localeData)
    .map(([code, name]) => ({ code, name }))
    .sortBy(locale => locale.name)
    .value();
};

export const getDefaultLocale = (
  locales: Locale[] = [],
  browserLocale = window.navigator.language,
): Locale | undefined => {
  const browserLocalePrefix = browserLocale.split("-")[0];

  return (
    locales.find(({ code }) => code.toLowerCase() === browserLocale) ??
    locales.find(({ code }) => code.toLowerCase() === browserLocalePrefix) ??
    locales.find(({ code }) => code === "en")
  );
};

export const getUserToken = (hash = window.location.hash): string => {
  return hash.replace(/^#/, "");
};
