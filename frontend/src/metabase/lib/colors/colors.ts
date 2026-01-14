/* eslint-disable no-color-literals */
// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW

import type { ColorSettings } from "metabase-types/api/settings";

import { getBaseColorsForThemeDefinitionOnly } from "./constants/base-colors";
import { METABASE_LIGHT_THEME } from "./constants/light";
import { deriveFullMetabaseTheme } from "./derive-theme";
import type { MetabaseColorKey } from "./types/color-keys";

const win = typeof window !== "undefined" ? window : ({} as Window);
const tokenFeatures = win.MetabaseBootstrap?.["token-features"] ?? {};
const shouldWhitelabel = !!tokenFeatures["whitelabel"];
const whitelabelColors =
  (shouldWhitelabel && win.MetabaseBootstrap?.["application-colors"]) || {};

const baseColors = getBaseColorsForThemeDefinitionOnly();

export const getColors = (whitelabelColors?: ColorSettings) =>
  deriveFullMetabaseTheme({
    baseTheme: METABASE_LIGHT_THEME,
    whitelabelColors,
  }).colors;

export const colors: Record<MetabaseColorKey, string> = {
  ...getColors(whitelabelColors),
};

export const mutateColors = (settings: ColorSettings) => {
  // Empty the `colors` object to make sure we don't hold onto previously defined (now undefined) values
  Object.keys(colors).forEach((key) => {
    delete colors[key as keyof typeof colors];
  });
  Object.assign(colors, getColors(settings));
};

export const staticVizOverrides = {
  "text-primary": baseColors.orion[80],
  "text-secondary": baseColors.orion[60],
  "text-tertiary": baseColors.orion[40],
};
