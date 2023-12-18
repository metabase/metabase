export type ActivePreviewPane = "preview" | "code";

export type EmbedType = "application" | null;

export type EmbedResource = {
  id: number | string;
  dashboard?: number;
  question?: number;
  public_uuid?: string;
  enable_embedding?: boolean;
  embedding_params?: EmbeddingParameters;
};

export type EmbedResourceType = "dashboard" | "question" | "application";

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
};
