export type EmbeddingProjectionPoint = {
  model: string;
  model_id: string;
  name: string;
  embedding: number[];
};

export type EmbeddingProjectionResponse = {
  points: EmbeddingProjectionPoint[];
};
