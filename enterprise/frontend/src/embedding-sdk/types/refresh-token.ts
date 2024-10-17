export type EmbeddingSessionToken = {
  id: string;
  exp: number;
};

export type FetchRequestTokenFn = (
  url: string,
) => Promise<EmbeddingSessionToken | null>;
