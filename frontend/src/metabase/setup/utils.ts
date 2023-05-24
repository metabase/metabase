import { getIn } from "icepick";
import _ from "underscore";
import { SetupApi, UtilApi } from "metabase/services";
import MetabaseSettings from "metabase/lib/settings";
import { DatabaseData, LocaleData } from "metabase-types/api";
import { Locale } from "metabase-types/store";

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

export const validateDatabase = async (database: DatabaseData) => {
  await SetupApi.validate_db({
    token: MetabaseSettings.get("setup-token"),
    details: database,
  });
};

const SUBSCRIBE_URL =
  "https://metabase.us10.list-manage.com/subscribe/post?u=869fec0e4689e8fd1db91e795&id=b9664113a8";
const SUBSCRIBE_TOKEN = "b_869fec0e4689e8fd1db91e795_b9664113a8";

export const subscribeToNewsletter = async (email: string): Promise<void> => {
  const body = new FormData();
  body.append("EMAIL", email);
  body.append(SUBSCRIBE_TOKEN, "");

  await fetch(SUBSCRIBE_URL, { method: "POST", mode: "no-cors", body });
};
