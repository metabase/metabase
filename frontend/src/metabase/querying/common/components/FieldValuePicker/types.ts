import type { FieldValue } from "metabase-types/api";

export interface FieldValuesResponse {
  values: FieldValue[];
  has_more_values: boolean;
}

export type UseGetFieldValuesArgs = {
  skip?: boolean;
};

export type UseGetFieldValuesResult = {
  data?: FieldValuesResponse | undefined;
  isLoading: boolean;
};

export type UseSearchFieldValuesArgs = {
  value: string;
  limit: number;
  skip?: boolean;
};

export type UseSearchFieldValuesResult = {
  data?: FieldValue[];
  error?: unknown;
  isFetching: boolean;
};

export type UseGetRemappedFieldValueArgs = {
  value: string;
  skip?: boolean;
};

export type UseGetRemappedFieldValueResult = {
  data?: FieldValue | undefined;
};
