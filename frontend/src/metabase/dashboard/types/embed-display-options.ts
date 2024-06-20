import type { DisplayTheme } from "metabase/public/lib/types";

export type EmbedTitle = boolean;
export type EmbedTitledControls = {
  titled: EmbedTitle;
};

export type EmbedHideDownloadButton = boolean | null;
export type EmbedHideDownloadButtonControls = {
  hideDownloadButton: EmbedHideDownloadButton;
};

export type EmbedHideParameters = string | null;
export type EmbedHideParametersControls = {
  hideParameters: EmbedHideParameters;
};

export type EmbedThemeControls = {
  theme: DisplayTheme;
  setTheme: (theme: DisplayTheme) => void;
  hasNightModeToggle?: boolean;
  onNightModeChange?: (isNightMode: boolean) => void;
  isNightMode?: boolean;
};

export type EmbedFont = string | null;
export type EmbedFontControls = {
  font: EmbedFont;
  setFont: (font: EmbedFont) => void;
};

export type EmbedDisplayParams = {
  bordered: boolean;
  titled: EmbedTitle;
  cardTitled: EmbedTitle;
  hideDownloadButton: EmbedHideDownloadButton;
  hideParameters: EmbedHideParameters;
  font: EmbedFont;
  theme: DisplayTheme;
};

export type EmbedDisplayControls = EmbedThemeControls &
  EmbedTitledControls &
  EmbedHideDownloadButtonControls &
  EmbedHideParametersControls &
  EmbedFontControls;
