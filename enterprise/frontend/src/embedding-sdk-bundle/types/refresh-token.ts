export type MetabaseEmbeddingSessionToken = {
  id: string;
  exp: number;
};

/**
 * @inline
 */
export type UserBackendJwtResponse = {
  jwt: string;
};

export type MetabaseFetchRequestTokenFn = () => Promise<UserBackendJwtResponse>;
