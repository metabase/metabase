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

export const getLogoUrl = state => getCustomLogoUrl(state.settings.values);

export const getHasCustomColors = state =>
  hasCustomColors(state.settings.values);

export const getLoadingMessage = state =>
  LOADING_MESSAGE_BY_SETTING[state.settings.values["loading-message"]];
