export type MetabaseEmbeddingSessionToken = {
  id: string;
  /**
   * (EMB-829) This is a temporary type. After we disallowed token without expiration,
   * we will remove make it a non-optional number again.
   */
  exp?: number | null;
};

/**
 * @inline
 */
export type UserBackendJwtResponse = {
  jwt: string;
};

export type MetabaseFetchRequestTokenFn = () => Promise<UserBackendJwtResponse>;
