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
};

export type EmbedDisplayParams = {
  background: EmbedBackground;
  bordered: boolean;
  titled: EmbedTitle;
  cardTitled: EmbedTitle;
  hideParameters: EmbedHideParameters;
  font: EmbedFont;
  theme: DisplayTheme;
  getClickActionMode: ClickActionModeGetter | undefined;
  downloadsEnabled: EmbedResourceDownloadOptions;
  withFooter: boolean;
  // TODO: (Kelvin 2026-01-29) move this to a new type in EMB-1025 (canceled at moment)
  withSubscriptions: boolean;
};
