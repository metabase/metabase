import type { DisplayTheme } from "metabase/public/lib/types";

export type EmbedTitledControls = {
  titled: boolean;
  setTitled: (titled: boolean) => void;
};

export type EmbedHideDownloadButtonControls = {
  hideDownloadButton: boolean;
  setHideDownloadButton: (hideDownloadButton: boolean) => void;
};

export type EmbedHideParametersControls = {
  hideParameters: string | null;
  setHideParameters: (hideParameters: string | null) => void;
};

export type EmbedThemeControls = {
  theme: DisplayTheme;
  setTheme: (theme: DisplayTheme) => void;
  hasNightModeToggle: boolean;
  onNightModeChange: (isNightMode: boolean) => void;
  isNightMode: boolean;
};

export type EmbedFontControls = {
  font: string | null;
  setFont: (font: string | null) => void;
};

export type EmbedBorderControls = {
  bordered: boolean;
  setBordered: (bordered: boolean) => void;
};

export type EmbedDisplayControls = EmbedThemeControls &
  EmbedBorderControls &
  EmbedTitledControls &
  EmbedHideDownloadButtonControls &
  EmbedHideParametersControls &
  EmbedFontControls;
