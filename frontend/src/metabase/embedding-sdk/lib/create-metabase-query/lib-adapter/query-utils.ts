import type {
  FieldSchema,
  SchemaJavaScriptType,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import { TYPE } from "metabase-lib/v1/types/constants";

const JAVASCRIPT_TYPE_BASE_TYPES: Partial<
  Record<SchemaJavaScriptType, string>
> = { number: TYPE.Float, boolean: TYPE.Boolean, Date: TYPE.DateTime };

export const getBaseType = (jsType?: SchemaJavaScriptType): string =>
  jsType != null && jsType in JAVASCRIPT_TYPE_BASE_TYPES
    ? (JAVASCRIPT_TYPE_BASE_TYPES[jsType as SchemaJavaScriptType] ?? TYPE.Text)
    : TYPE.Text;

export const getFieldBaseType = (field: FieldSchema): string =>
  field.baseType ?? getBaseType(field.jsType);

export const getFieldEffectiveType = (field: FieldSchema): string =>
  field.effectiveType ?? getFieldBaseType(field);

export function fieldHasTime(field: FieldSchema): boolean {
  const schemaType = field.effectiveType ?? field.baseType;

  return typeof schemaType === "string" && schemaType.includes(TYPE.DateTime);
}
