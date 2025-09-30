import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

type EmbedBackground = boolean;

type EmbedTitle = boolean;

export type EmbedHideParameters = string | null;
export type EmbedHideParametersControls = {
  hideParameters: EmbedHideParameters;
};

export type EmbedFont = string | null;

export type EmbedDisplayParams = {
  background: EmbedBackground;
  bordered: boolean;
  titled: EmbedTitle;
  cardTitled: EmbedTitle;
  hideParameters: EmbedHideParameters;
  font: EmbedFont;
  getClickActionMode: ClickActionModeGetter | undefined;
  downloadsEnabled: EmbedResourceDownloadOptions;
  withFooter: boolean;
};
