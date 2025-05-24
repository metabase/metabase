export type MetabaseEmbeddingSessionToken = {
  id: string;
  exp: number;
};

export type UserBackendJwtResponse = {
  jwt: string;
};

export type MetabaseFetchRequestTokenFn = (
  url: string,
) => Promise<UserBackendJwtResponse>;
