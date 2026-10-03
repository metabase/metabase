import type { LlmProviderConfig, LlmProviderField } from "metabase-types/api";

// A field can hang off another one — Google's credential inputs follow its authentication method —
// and a hidden one is not part of the connection: its value is cleared on save so switching the
// method leaves the credential it replaced behind.
export function isVisibleField(
  field: LlmProviderField,
  fields: LlmProviderField[],
  values: LlmProviderConfig,
) {
  const condition = field.show_when;
  if (!condition) {
    return true;
  }
  const controlling = fields.find((other) => other.key === condition.field);
  const value = values[condition.field] || controlling?.default || "";
  return value === condition.value;
}

export function getHiddenFieldKeys(
  fields: LlmProviderField[],
  values: LlmProviderConfig,
) {
  return fields
    .filter((field) => !isVisibleField(field, fields, values))
    .map((field) => field.key);
}
