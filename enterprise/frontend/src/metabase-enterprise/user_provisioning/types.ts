export interface MaskedScimApiKey {
  id: number;
  scope: "scim";
  key: string;
  key_prefix: string;
  masked_key: string;
  name: string;
  user_id: null;
  created_at: string;
  creator_id: number;
  updated_at: string;
  updated_by_id: number;
}

export interface UnmaskedScimApiKey extends MaskedScimApiKey {
  unmasked_key: string;
}
