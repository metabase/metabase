export type MetabaseEmbeddingSessionToken = {
  id: string;
  exp: number;
};

export type UserBackendResponse = {
  jwt: string;
};

export type MetabaseFetchRequestTokenFn = (
  url: string,
) => Promise<UserBackendResponse>;
