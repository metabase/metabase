import type { Dispatch, SetStateAction } from "react";

import type { DisplayTheme } from "metabase/public/lib/types";

type EmbedTitle = boolean;
type EmbedTitledControls = {
  titled: EmbedTitle;
  setTitled: Dispatch<SetStateAction<EmbedTitle>>;
};

type EmbedHideDownloadButton = boolean | null;
type EmbedHideDownloadButtonControls = {
  hideDownloadButton: EmbedHideDownloadButton;
  setHideDownloadButton: Dispatch<SetStateAction<EmbedHideDownloadButton>>;
};

type EmbedHideParameters = string | null;
export type EmbedHideParametersControls = {
  hideParameters: EmbedHideParameters;
  setHideParameters: Dispatch<SetStateAction<EmbedHideParameters>>;
};

export type EmbedFont = string | null;
type EmbedFontControls = {
  font: EmbedFont;
  setFont: (font: EmbedFont) => void;
};

type EmbedBordered = boolean;
type EmbedBorderControls = {
  bordered: EmbedBordered;
  setBordered: Dispatch<SetStateAction<EmbedBordered>>;
};

export type EmbedThemeControls = {
  theme: DisplayTheme;
  setTheme: (theme: DisplayTheme) => void;
  hasNightModeToggle?: boolean;
  onNightModeChange?: (isNightMode: boolean) => void;
  isNightMode?: boolean;
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
