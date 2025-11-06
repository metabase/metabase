import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { DatasetColumn, Field } from "metabase-types/api";

import type { FieldPatch, ValidationResult } from "./types";

export function getFieldPatch(field: Field | DatasetColumn): FieldPatch {
  const {
    display_name,
    description,
    semantic_type,
    fk_target_field_id,
    visibility_type,
    settings,
  } = field;
  return {
    display_name,
    description,
    semantic_type,
    fk_target_field_id,
    visibility_type,
    settings,
  };
}

export function mergeFieldMetadata(
  queryMetadata: Field[] | DatasetColumn[] | null,
  savedMetadata: Field[] | DatasetColumn[] | null,
) {
  if (queryMetadata == null || savedMetadata == null) {
    return queryMetadata;
  }

  const savedFieldByName = Object.fromEntries(
    savedMetadata.map((savedField) => [savedField.name, savedField]),
  );
  return queryMetadata.map((queryField) => {
    const savedField = savedFieldByName[queryField.name];
    return savedField == null
      ? queryField
      : { ...queryField, ...getFieldPatch(savedField) };
  });
}

export function getValidationResult(
  query: Lib.Query,
  resultMetadata: Field[] | DatasetColumn[] | null,
): ValidationResult {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    const tags = Object.values(Lib.templateTags(query));
    if (tags.some((t) => t.type !== "card" && t.type !== "snippet")) {
      return {
        isValid: false,
        errorMessage: t`In models, you can use snippets and question or model references, but not variables.`,
      };
    }

    if (resultMetadata == null) {
      return {
        isValid: false,
        errorMessage: t`You must run the query before you can save this model.`,
      };
    }
  }

  return { isValid: Lib.canSave(query, "model") };
}
