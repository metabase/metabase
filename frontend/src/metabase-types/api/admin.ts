export type CreateApiKeyInput = {
  name: string;
  group_id: string;
};

export type CreateApiKeyResponse = {
  unmasked_key: string;
};

export type RegenerateApiKeyResponse = {
  unmasked_key: string;
};

export type EditApiKeyInput = {
  id: number;
  group_id: string;
  name: string;
};

export type ApiKey = {
  name: string;
  id: number;
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

export type CreateApiKeyInput = {
  name: string;
  group_id: string;
};

export type CreateApiKeyResponse = {
  unmasked_key: string;
};

export type UpdateApiKeyInput = {
  id: number;
  group_id: string;
  name: string;
};

export type UpdateApiKeyResponse = void;

export type RegenerateApiKeyResponse = {
  unmasked_key: string;
};

export interface Log {
  timestamp: string;
  process_uuid: string;
  fqns: string;
  msg: string;
  level: string;
  exception: any;
}
