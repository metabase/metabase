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
import type Table from "metabase-lib/metadata/Table";

const hasPk = (table?: Table) =>
  !!table?.fields?.some(
    (field: FieldEntity) => isPK(field) && isInteger(field),
  );

export const canIndexField = (field: FieldEntity): boolean => {
  return !!(isString(field) && !isBoolean(field) && hasPk(field?.table));
};

export const getPkRef = (fields?: Field[]) => fields?.find(isPK)?.field_ref;

export const fieldHasIndex = (modelIndexes: ModelIndex[], field: Field) =>
  !!modelIndexes.some((index: any) =>
    _.isEqual(index.value_ref, field.field_ref),
  );
