import type { Field } from "metabase-types/api";

export type FieldOverrides = Partial<
  Pick<
    Field,
    | "display_name"
    | "description"
    | "semantic_type"
    | "fk_target_field_id"
    | "visibility_type"
    | "settings"
  >
>;

export type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};
