/* @flow */

export type EmbeddingParams = {
  [key: string]: string,
};

export type EmbeddableResource = {
  id: string,
  public_uuid: string,
  embedding_params: EmbeddingParams,
};
