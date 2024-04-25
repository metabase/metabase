import { getIn } from "icepick";
import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import { UtilApi } from "metabase/services";
import type { LocaleData } from "metabase-types/api";
import type { Locale } from "metabase-types/store";

import { SUBSCRIBE_URL, SUBSCRIBE_TOKEN } from "./constants";

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

export const validatePassword = async (password: string) => {
  const error = MetabaseSettings.passwordComplexityDescription(password);
  if (error) {
    return error;
  }

  try {
    await UtilApi.password_check({ password });
  } catch (error) {
    return getIn(error, ["data", "errors", "password"]);
  }
};

export const subscribeToNewsletter = async (email: string): Promise<void> => {
  const body = new FormData();
  body.append("EMAIL", email);
  body.append(SUBSCRIBE_TOKEN, "");

  await fetch(SUBSCRIBE_URL, { method: "POST", mode: "no-cors", body });
};
