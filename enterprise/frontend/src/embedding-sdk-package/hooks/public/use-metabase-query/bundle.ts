import { getWindow } from "embedding-sdk-shared/lib/get-window";

export const getEmbeddingSdkBundle = () =>
  getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE;

export const getResolveDatasetQueryFromBundle = () =>
  getEmbeddingSdkBundle()?.resolveDatasetQuery;
