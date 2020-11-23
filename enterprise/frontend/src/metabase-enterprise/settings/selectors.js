import { createSelector } from "reselect";

const DEFAULT_LOGO_URL = "app/assets/img/logo.svg";

export const getLogoUrl = state =>
  state.settings.values["application-logo-url"] ||
  state.settings.values.application_logo_url ||
  DEFAULT_LOGO_URL;

const getApplicationColors = state =>
  state.settings.values["application-colors"] ||
  state.settings.values.application_colors;

const getHasCustomColors = createSelector(
  [getApplicationColors],
  applicationColors => Object.keys(applicationColors || {}).length > 0,
);

export const getHasCustomLogo = createSelector(
  [getLogoUrl],
  logoUrl => logoUrl !== DEFAULT_LOGO_URL,
);

export const getIsWhitelabeled = createSelector(
  [getHasCustomLogo, getHasCustomColors],
  (hasCustomLogo, hasCustomColors) => hasCustomLogo || hasCustomColors,
);
