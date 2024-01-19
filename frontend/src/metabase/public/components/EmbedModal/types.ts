import type { Card, Dashboard } from "metabase-types/api";

export type ActivePreviewPane = "preview" | "code";

export type EmbedModalStep = "application" | "legalese" | null;

export type EmbedResource = (Card | Dashboard) & {
  embedding_params?: EmbeddingParameters | null;
};

export type EmbedResourceType = "dashboard" | "question";

export type EmbedResourceParameter = {
  id: string;
  name: string;
  slug: string;
  type: string;
};

export type EmbedResourceParameterWithValue = EmbedResourceParameter & {
  value: string;
};

export type EmbeddingParameters = {
  [key: string]: string;
};

export type EmbeddingParametersValues = {
  [key: string]: string;
};

export type EmbeddingDisplayOptions = {
  font: null | string;
  theme: null | string;
  bordered: boolean;
  titled: boolean;
  hide_download_button?: true | null;
};
