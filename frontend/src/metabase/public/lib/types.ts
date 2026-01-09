import type { CodeLanguage } from "metabase/common/components/CodeEditor";
import type {
  Card,
  Dashboard,
  ParameterValueOrArray,
} from "metabase-types/api";

export type DisplayTheme = "light" | "night" | "transparent";

export type EmbedResource = (Card | Dashboard) & {
  embedding_params?: EmbeddingParameters | null;
};

export type EmbedResourceType = "dashboard" | "question" | "document";
export type GuestEmbedResourceType = "dashboard" | "question";

export type EmbedResourceParameter = {
  id: string;
  name: string;
  slug: string;
  type: string;
  required?: boolean;
  default?: ParameterValueOrArray | null;
};

export type EmbedResourceDownloadOptions = {
  pdf?: boolean;
  results?: boolean;
};

export type EmbeddingType = "static-legacy" | "guest-embed";

export type EmbeddingParameterVisibility = "disabled" | "enabled" | "locked";

export type EmbeddingParameters = Record<string, EmbeddingParameterVisibility>;

export type EmbeddingParametersValues = Record<
  string,
  number | string | string[] | null | undefined
>;

/**
 * This is a type for all the display options in static embedding sharing modal's Look and Feel tab.
 */
export type EmbeddingDisplayOptions = {
  font: null | string;
  theme: DisplayTheme;
  background: boolean;
  bordered: boolean;
  titled: boolean;
  downloads: EmbedResourceDownloadOptions | null;
};

/**
 * This is a type that doesn't belong to static embedding sharing modal.
 * Properties here exists only in the document (just `hide_parameters` since `locale` is a new one),
 * but not in the UI.
 */
export type EmbeddingAdditionalHashOptions = {
  hide_parameters?: string | null;
  locale?: string;
};

export type EmbeddingHashOptions = {
  downloads: string | boolean | null;
} & Omit<EmbeddingDisplayOptions, "downloads"> &
  EmbeddingAdditionalHashOptions;

export type CodeSampleParameters = {
  siteUrl: string;
  secretKey: string;
  resourceType: EmbedResourceType;
  resourceId: EmbedResource["id"];
  params: EmbeddingParametersValues;
  displayOptions?: EmbeddingDisplayOptions;
  withIframeSnippet: boolean;
};

export type ClientCodeSampleConfig = {
  id: string;
  name: string;
  source: string;
  language: CodeLanguage;
};

export type ServerCodeSampleConfig = {
  id: string;
  name: string;
  source: string;
  parametersSource: string;
  getIframeQuerySource: string;
  embedOption?: string;
  language: CodeLanguage;
};

export type CodeSampleOption = ClientCodeSampleConfig | ServerCodeSampleConfig;
