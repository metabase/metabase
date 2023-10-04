import _ from "underscore";
import type { Field } from "metabase-types/api";
import type { ModelIndex } from "metabase-types/api/modelIndexes";
import {
  isString,
  isPK,
  isInteger,
  isBoolean,
} from "metabase-lib/types/utils/isa";
import type FieldEntity from "metabase-lib/metadata/Field";
import type Question from "metabase-lib/Question";

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
