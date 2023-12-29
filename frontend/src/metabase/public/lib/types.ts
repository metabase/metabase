import type { Card, Dashboard } from "metabase-types/api";

export type EmbedType = "application" | null;

export type EmbedResource = (Card | Dashboard) & {
  embedding_params?: EmbeddingParameters;
};

export type EmbedResourceType = "dashboard" | "question";

export type EmbedResourceParameter = {
  id: string;
  name: string;
  slug: string;
  type: string;
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

export type CodeSampleParameters = {
  siteUrl: string;
  secretKey: string;
  resourceType: EmbedResourceType;
  resourceId: EmbedResource["id"];
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;
};

export type ClientCodeSampleConfig = {
  name: string;
  source: string;
  mode: string;
  embedOption?: string;
};

export type ServerCodeSampleConfig = {
  name: string;
  source: string;
  parametersSource: string;
  iframeUrlSource: string;
  mode: string;
};

export type CodeSampleOption = ClientCodeSampleConfig | ServerCodeSampleConfig;
