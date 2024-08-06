import type { DashboardNightModeControls } from "metabase/dashboard/types/display-options";
import type { DisplayTheme } from "metabase/public/lib/types";

type EmbedBackground = boolean;
type EmbedBackgroundControls = {
  background: EmbedBackground;
};

type EmbedTitle = boolean;
type EmbedTitledControls = {
  titled: EmbedTitle;
};

type EmbedHideDownloadButton = boolean | null;
type EmbedDownloadsEnabled = boolean | null;
type EmbedHideDownloadButtonControls = {
  hideDownloadButton: EmbedHideDownloadButton;
  downloadsEnabled: EmbedDownloadsEnabled;
};

export type EmbedHideParameters = string | null;
export type EmbedHideParametersControls = {
  hideParameters: EmbedHideParameters;
};

export type EmbedFont = string | null;
type EmbedFontControls = {
  font: EmbedFont;
  setFont: (font: EmbedFont) => void;
};

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
  downloadsEnabled: boolean;
};

export type EmbedDisplayControls = EmbedThemeControls &
  EmbedBackgroundControls &
  EmbedTitledControls &
  EmbedHideDownloadButtonControls &
  EmbedHideParametersControls &
  EmbedFontControls;
