import type {
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/components/EmbedModal";

export type IFrameUrlProps = { iframeUrl: string; mode?: string };

export type CodeSnippetProps = {
  siteUrl: string;
  secretKey: string;
  resourceType: EmbedResourceType;
  resourceId: EmbedResource["id"];
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;
  mode?: string;
};

export type SignedEmbedOption = {
  name: string;
  source: () => string;
};

export type SignTokenOption = {
  name: string;
  source: () => string;
  mode: string;
  embedOption?: string;
};

export type GetSignedTokenProps = {
  resourceType: EmbedResourceType;
  resourceId: EmbedResource["id"];
  params: Record<string, unknown>;
  secretKey: string;
  previewEmbeddingParams: EmbeddingParameters;
};

export type GetSignedPreviewUrlProps = {
  siteUrl: string;
  resourceType: EmbedResourceType;
  resourceId: EmbedResource["id"];
  params: Record<string, unknown>;
  options: Record<string, unknown>;
  secretKey: string;
  previewEmbeddingParams: EmbeddingParameters;
};
