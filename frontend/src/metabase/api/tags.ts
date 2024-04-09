export const API_KEY_TAG = "ApiKey" as const;
export const FIELD_VALUES_TAG = "FieldValues" as const;

export const tagTypes = [API_KEY_TAG, FIELD_VALUES_TAG];
export type TagTypes = typeof tagTypes[number];
