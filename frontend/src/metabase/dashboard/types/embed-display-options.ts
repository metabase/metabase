import type { DashboardNightModeControls } from "metabase/dashboard/types/display-options";
import type {
  DisplayTheme,
  EmbedResourceDownloadOptions,
} from "metabase/public/lib/types";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

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
  getClickActionMode?: ClickActionModeGetter;
  downloadsEnabled: EmbedResourceDownloadOptions;
  withFooter: boolean;
};
