import type { Card, Dashboard } from "metabase-types/api";

export type DisplayTheme = "light" | "night" | "transparent";

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
  required?: boolean;
  default?: unknown;
};

export type EmbeddingParameterVisibility = "disabled" | "enabled" | "locked";

export type EmbeddingParameters = Record<string, EmbeddingParameterVisibility>;

export type EmbeddingParametersValues = Record<string, string>;

export type EmbeddingDisplayOptions = {
  font: null | string;
  theme: DisplayTheme;
  bordered: boolean;
  titled: boolean;
  hide_download_button: boolean | null;
};

export type CodeSampleParameters = {
  siteUrl: string;
  secretKey: string;
  resourceType: EmbedResourceType;
  resourceId: EmbedResource["id"];
  params: EmbeddingParametersValues;
  displayOptions: EmbeddingDisplayOptions;
};

export type ClientCodeSampleConfig = {
  id: string;
  name: string;
  source: string;
  mode: string;
};

export type ServerCodeSampleConfig = {
  id: string;
  name: string;
  source: string;
  parametersSource: string;
  getIframeQuerySource: string;
  mode: string;
  embedOption?: string;
};

export type CodeSampleOption = ClientCodeSampleConfig | ServerCodeSampleConfig;
