export type MetabaseEmbeddingSessionToken = {
  id: string;
  exp: number;
};

export type MetabaseFetchRequestTokenFn = (
  url: string,
) => Promise<MetabaseEmbeddingSessionToken | null>;
