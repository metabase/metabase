import type { DisplayTheme } from "metabase/public/lib/types";

export type EmbedTitle = boolean;
export type EmbedTitledControls = {
  titled: EmbedTitle;
  setTitled: (titled: EmbedTitle) => void;
};

export type EmbedHideDownloadButton = boolean | null;
export type EmbedHideDownloadButtonControls = {
  hideDownloadButton: EmbedHideDownloadButton;
  setHideDownloadButton: (hideDownloadButton: EmbedHideDownloadButton) => void;
};

export type EmbedHideParameters = string | null;
export type EmbedHideParametersControls = {
  hideParameters: EmbedHideParameters;
  setHideParameters: (hideParameters: EmbedHideParameters) => void;
};

export type EmbedThemeControls = {
  theme: DisplayTheme;
  setTheme: (theme: DisplayTheme) => void;
  hasNightModeToggle: boolean;
  onNightModeChange: (isNightMode: boolean) => void;
  isNightMode: boolean;
};

export type EmbedFont = string | null;
export type EmbedFontControls = {
  font: EmbedFont;
  setFont: (font: EmbedFont) => void;
};

export type EmbedBordered = boolean;
export type EmbedBorderControls = {
  bordered: EmbedBordered;
  setBordered: (bordered: EmbedBordered) => void;
};

export type EmbedDisplayParams = {
  bordered: EmbedBordered;
  titled: EmbedTitle;
  cardTitled: EmbedTitle;
  hideDownloadButton: EmbedHideDownloadButton;
  hideParameters: EmbedHideParameters;
  font: EmbedFont;
  theme: DisplayTheme;
};

export type EmbedDisplayControls = EmbedThemeControls &
  EmbedBorderControls &
  EmbedTitledControls &
  EmbedHideDownloadButtonControls &
  EmbedHideParametersControls &
  EmbedFontControls;
