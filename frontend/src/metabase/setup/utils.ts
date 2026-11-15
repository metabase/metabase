import _ from "underscore";

import type { Locale } from "metabase/redux/store";
import type { LocaleData } from "metabase-types/api";

import { SUBSCRIBE_TOKEN, SUBSCRIBE_URL } from "./constants";

export const getLocales = (
  localeData: LocaleData[] = [["en", "English"]],
): Locale[] => {
  return _.chain(localeData)
    .map(([code, name]) => ({ code, name }))
    .sortBy((locale) => locale.name)
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

export const subscribeToNewsletter = (email: string) => {
  const body = new FormData();
  body.append("EMAIL", email);
  body.append(SUBSCRIBE_TOKEN, "");

  if ("sendBeacon" in navigator) {
    navigator.sendBeacon(SUBSCRIBE_URL, body);
  } else {
    fetch(SUBSCRIBE_URL, {
      method: "POST",
      mode: "no-cors",
      body,
      keepalive: true,
    });
  }
};
