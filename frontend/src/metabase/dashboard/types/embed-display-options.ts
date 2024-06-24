import type { DisplayTheme } from "metabase/public/lib/types";

type EmbedBackground = boolean;
type EmbedBackgroundControls = {
  background: EmbedBackground;
};

type EmbedTitle = boolean;
type EmbedTitledControls = {
  titled: EmbedTitle;
};

export type EmbedHideDownloadButton = boolean | null;
type EmbedHideDownloadButtonControls = {
  hideDownloadButton: EmbedHideDownloadButton;
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
  hasNightModeToggle?: boolean;
  onNightModeChange?: (isNightMode: boolean) => void;
  isNightMode?: boolean;
};

export type EmbedDisplayParams = {
  background: EmbedBackground;
  bordered: boolean;
  titled: EmbedTitle;
  cardTitled: EmbedTitle;
  hideDownloadButton: EmbedHideDownloadButton;
  hideParameters: EmbedHideParameters;
  font: EmbedFont;
  theme: DisplayTheme;
};

export type EmbedDisplayControls = EmbedThemeControls &
  EmbedBackgroundControls &
  EmbedTitledControls &
  EmbedHideDownloadButtonControls &
  EmbedHideParametersControls &
  EmbedFontControls;
