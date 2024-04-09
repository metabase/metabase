import type { EmbedResourceParameter } from "metabase/public/lib/types";

export type ActivePreviewPane = "preview" | "code";

export type EmbedResourceParameterWithValue = EmbedResourceParameter & {
  value: string;
};

export type EmbedCodePaneVariant = "overview" | "parameters" | "appearance";
