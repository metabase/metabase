import { t } from "ttag";
import { number, object, string } from "yup";

import type { ApiKey } from "metabase-types/api";

export function formatMaskedKey(maskedKey: string) {
  return maskedKey.substring(0, 7) + "...";
}

export const API_KEY_VALIDATION_SCHEMA = object({
  name: string().required(),
  group_id: number()
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    .typeError(t`Select a group`)
    .required(),
});

export type FlatApiKey = ApiKey & {
  group_name: string;
  updated_by_name: string;
};

export const flattenApiKey = (apiKey: ApiKey): FlatApiKey => ({
  ...apiKey,
  group_name: apiKey.group.name,
  updated_by_name: apiKey.updated_by?.common_name || "",
});
