import type { DashboardNightModeControls } from "metabase/dashboard/types/display-options";
import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import type { DisplayTheme } from "metabase/public/lib/types";

type EmbedBackground = boolean;

type EmbedTitle = boolean;

export type EmbedHideParameters = string | null;
export type EmbedHideParametersControls = {
  hideParameters: EmbedHideParameters;
};

export type EmbedFont = string | null;

export type EmbedThemeControls = {
  theme: DisplayTheme;
  setTheme: (theme: DisplayTheme) => void;
} & DashboardNightModeControls;

export type EmbedDisplayParams = {
  background: EmbedBackground;
  bordered: boolean;
  titled: EmbedTitle;
  cardTitled: EmbedTitle;
  hideParameters: EmbedHideParameters;
  font: EmbedFont;
  theme: DisplayTheme;
  plugins?: MetabasePluginsConfig;
  downloadsEnabled: boolean;
  withFooter: boolean;
};
