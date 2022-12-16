import { getSetting, getSettings } from "metabase/selectors/settings";
import { LOADING_MESSAGE_BY_SETTING } from "../whitelabel/lib/loading-message";

const DEFAULT_LOGO_URL = "app/assets/img/logo.svg";

const hasCustomColors = settingValues => {
  const applicationColors =
    settingValues["application-colors"] || settingValues.application_colors;
  return Object.keys(applicationColors || {}).length > 0;
};

const getCustomLogoUrl = settingValues => {
  return (
    settingValues["application-logo-url"] ||
    settingValues.application_logo_url ||
    DEFAULT_LOGO_URL
  );
};

export const getLogoUrl = state => getCustomLogoUrl(getSettings(state));

export const getHasCustomColors = state => hasCustomColors(getSettings(state));

export const getLoadingMessage = state =>
  LOADING_MESSAGE_BY_SETTING[getSetting(state, "loading-message")];
