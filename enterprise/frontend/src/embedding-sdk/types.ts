export type SDKConfigType = {
  metabaseInstanceUrl: string;
  font?: string;
  authType: "apiKey" | "jwt";
  apiKey: string;
  jwtProviderUri: string;
};

export type EmbeddingSessionTokenState = {
    token: {
        id: string;
        exp: number;
    };
    loading: boolean;
    error: null | string;
} | null