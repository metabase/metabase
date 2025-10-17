import _ from "underscore";

import type Question from "metabase-lib/v1/Question";
import type FieldEntity from "metabase-lib/v1/metadata/Field";
import {
  isBoolean,
  isInteger,
  isPK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";
import type { ModelIndex } from "metabase-types/api/modelIndexes";

const hasSingleIntegerPkInQuestion = (model?: Question) => {
  const pkFields = model
    ?.getResultMetadata()
    ?.filter((field: Field) => isPK(field));

  return pkFields?.length === 1 && isInteger(pkFields[0]);
};

export const canIndexModelQuestionField = (
  field: FieldEntity,
  model: Question,
): boolean => {
  return !!(
    isString(field) &&
    !isBoolean(field) &&
    hasSingleIntegerPkInQuestion(model)
  );
};

const hasSingleIntegerPk = (resultMetadata?: Field[]) => {
  const pkFields = resultMetadata?.filter((field: Field) => isPK(field));

  return pkFields?.length === 1 && isInteger(pkFields[0]);
};

export const canIndexModelField = (field: Field, resultsMetadata?: Field[]) => {
  return !!(
    isString(field) &&
    !isBoolean(field) &&
    hasSingleIntegerPk(resultsMetadata)
  );
};

export const getPkRef = (fields?: Field[]) => fields?.find(isPK)?.field_ref;

export const fieldHasIndex = (
  modelIndexes: ModelIndex[] | undefined,
  field: Field,
) =>
  !!modelIndexes?.some((index: any) =>
    _.isEqual(index.value_ref, field.field_ref),
  );
