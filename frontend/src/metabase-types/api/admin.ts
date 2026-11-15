export type ApiKeyId = number;

export type ApiKey = {
  name: string;
  id: ApiKeyId;
  group: {
    id: number;
    name: string;
  };
  creator_id: number;
  masked_key: string;
  created_at: string;
  updated_at: string;
  updated_by: {
    id: number;
    common_name: string;
  };
  /** Throttled liveness timestamp, stamped on each authenticated request. Null until first use. */
  last_used_at?: string | null;
};

export type CreateApiKeyRequest = {
  name: string;
  group_id: number;
};

export type CreateApiKeyResponse = {
  unmasked_key: string;
  name: string;
  errors: {
    name: string;
  };
};

export type UpdateApiKeyRequest = {
  id: ApiKeyId;
  group_id: number;
  name: string;
};

export type UpdateApiKeyResponse = void;

export type RegenerateApiKeyResponse = {
  unmasked_key: string;
};
