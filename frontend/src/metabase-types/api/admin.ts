export type AppId = number;

export type App = {
  id: AppId;
  name: string;
  auth_method: "jwt" | "saml";
  theme: string | null;
  logo: string | null;
  published: boolean;
  collection_id: number;
  created_at: string;
  updated_at: string;
};

export type CreateAppRequest = {
  name: string;
  auth_method: "jwt" | "saml";
  collection_id: number;
  theme?: string | null;
  logo?: string | null;
  published?: boolean;
};

export type UpdateAppRequest = Partial<CreateAppRequest> & { id: AppId };

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
