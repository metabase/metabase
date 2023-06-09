import { getSetting, getSettings } from "metabase/selectors/settings";
import { LOADING_MESSAGE_BY_SETTING } from "../whitelabel/lib/loading-message";
import type { EnterpriseSettings, EnterpriseState } from "./types";

const DEFAULT_LOGO_URL = "app/assets/img/logo.svg";

const hasCustomColors = (settingValues: EnterpriseSettings) => {
  const applicationColors =
    settingValues["application-colors"] || settingValues.application_colors;
  return Object.keys(applicationColors || {}).length > 0;
};

const getCustomLogoUrl = (settingValues: EnterpriseSettings) => {
  return (
    settingValues["application-logo-url"] ||
    settingValues.application_logo_url ||
    DEFAULT_LOGO_URL
  );
};

export const getLogoUrl = (state: EnterpriseState) =>
  getCustomLogoUrl(getSettings(state));

export const getHasCustomColors = (state: EnterpriseState) =>
  hasCustomColors(getSettings(state));

export const getLoadingMessage = (state: EnterpriseState) =>
  LOADING_MESSAGE_BY_SETTING[getSetting(state, "loading-message")];

const DEFAULT_APPLICATION_NAME = "Metabase";
export const getIsWhiteLabeling = (states: EnterpriseState) =>
  getSetting(states, "application-name") !== DEFAULT_APPLICATION_NAME;
