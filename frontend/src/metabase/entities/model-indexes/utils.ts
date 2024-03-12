import { dissocIn } from "icepick";
import _ from "underscore";

import type Question from "metabase-lib/Question";
import type FieldEntity from "metabase-lib/metadata/Field";
import {
  isString,
  isPK,
  isInteger,
  isBoolean,
} from "metabase-lib/types/utils/isa";
import type { Field, FieldWithMaybeIndex } from "metabase-types/api";
import type { ModelIndex } from "metabase-types/api/modelIndexes";

const hasSingleIntegerPk = (model?: Question) => {
  const pkFields = model
    ?.getResultMetadata()
    ?.filter((field: Field) => isPK(field));

  return pkFields?.length === 1 && isInteger(pkFields[0]);
};

export const canIndexField = (field: FieldEntity, model: Question): boolean => {
  return !!(isString(field) && !isBoolean(field) && hasSingleIntegerPk(model));
};

export const getPkRef = (fields?: Field[]) => fields?.find(isPK)?.field_ref;

export const fieldHasIndex = (modelIndexes: ModelIndex[], field: Field) =>
  !!modelIndexes.some((index: any) =>
    _.isEqual(index.value_ref, field.field_ref),
  );

export function cleanIndexFlags(fields: Field[] = []) {
  return fields.map((field: FieldWithMaybeIndex) => {
    if (field.should_index !== undefined) {
      return dissocIn(field, ["should_index"]);
    } else {
      return field;
    }
  });
}
