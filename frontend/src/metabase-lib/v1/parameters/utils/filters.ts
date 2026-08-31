import * as Lib from "metabase-lib";
import type { TemplateTagDimension } from "metabase-lib/v1/Dimension";
import { getParameterOperatorName } from "metabase-lib/v1/parameters/utils/operators";
import {
  getParameterSubType,
  getParameterType,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
import type Variable from "metabase-lib/v1/variables/Variable";
import type {
  FieldValuesType,
  Parameter,
  TemplateTag,
} from "metabase-types/api";

import type { FieldTypeInfo } from "../../types/utils/isa";
import {
  isAddress,
  isBoolean,
  isDate,
  isFK,
  isNumeric,
  isPK,
  isString,
  isStringLike,
} from "../../types/utils/isa";

type ColumnInfo = {
  isString: boolean;
  isNumeric: boolean;
  isBoolean: boolean;
  isTemporal: boolean;
  isID: boolean;
  isAddress: boolean;
  isTemporalBucketable: boolean;
  hasFieldValues: FieldValuesType | undefined;
};

function isParameterCompatibleWithColumn(
  parameter: Parameter | string,
  {
    isString,
    isNumeric,
    isBoolean,
    isTemporal,
    isID,
    isAddress,
    isTemporalBucketable,
    hasFieldValues,
  }: ColumnInfo,
) {
  const type = getParameterType(parameter);
  switch (type) {
    case "date":
      return isTemporal;
    case "id":
      return isID;
    case "category":
      return hasFieldValues === "list";
    case "location":
      return isString && isAddress;
    case "number":
      return isNumeric && !isID;
    case "boolean":
      return isBoolean;
    case "string":
      return (
        (isString || (isBoolean && hasFieldValues === "list")) && !isAddress
      );
    case "temporal-unit":
      return isTemporalBucketable;
    default:
      return false;
  }
}

/**
 * The subset of a field a parameter compatibility check reads. Satisfied by both
 * the API field and the metabase-lib v1 wrapper.
 */
export type ParameterFilterableField = FieldTypeInfo & {
  has_field_values?: FieldValuesType;
};

export function fieldFilterForParameter(
  parameter: Parameter | string,
): (field: ParameterFilterableField) => boolean {
  return (field) =>
    isParameterCompatibleWithColumn(parameter, {
      isString: isString(field) || isStringLike(field),
      isNumeric: isNumeric(field),
      isBoolean: isBoolean(field),
      isTemporal: isDate(field),
      isID: isPK(field) || isFK(field),
      isAddress: isAddress(field),
      isTemporalBucketable: false,
      hasFieldValues: field.has_field_values,
    });
}

export function columnFilterForParameter(
  query: Lib.Query,
  stageIndex: number,
  parameter: Parameter | string,
): (column: Lib.ColumnMetadata) => boolean {
  return (column) =>
    isParameterCompatibleWithColumn(parameter, {
      isString: Lib.isStringOrStringLike(column),
      isNumeric: Lib.isNumeric(column),
      isBoolean: Lib.isBoolean(column),
      isTemporal: Lib.isTemporal(column),
      isID: Lib.isID(column),
      isAddress: Lib.isAddress(column),
      isTemporalBucketable: Lib.isTemporalBucketable(query, stageIndex, column),
      hasFieldValues: Lib.fieldValuesSearchInfo(query, column).hasFieldValues,
    });
}

export function dimensionFilterForParameter(parameter: Parameter | string) {
  const fieldFilter = fieldFilterForParameter(parameter);
  return (dimension: TemplateTagDimension) => {
    const field = dimension.field();
    return field != null && fieldFilter(field);
  };
}

export function variableFilterForParameter(parameter: Parameter | string) {
  const tagFilter = tagFilterForParameter(parameter);
  return (variable: Variable) => {
    if (variable instanceof TemplateTagVariable) {
      const tag = variable.tag();
      return tag ? tagFilter(tag) : false;
    }
    return false;
  };
}

function tagFilterForParameter(
  parameter: Parameter | string,
): (tag: TemplateTag) => boolean {
  const type = getParameterType(parameter);
  const subtype = getParameterSubType(parameter);
  const operator = getParameterOperatorName(subtype);
  if (operator !== "=") {
    return () => false;
  }

  switch (type) {
    case "date":
      return (tag) => subtype === "single" && tag.type === "date";
    case "location":
      return (tag) => tag.type === "number" || tag.type === "text";
    case "id":
      return (tag) => tag.type === "number" || tag.type === "text";
    case "category":
      return (tag) => tag.type === "number" || tag.type === "text";
    case "number":
      return (tag) => tag.type === "number";
    case "string":
      return (tag) => tag.type === "text";
    case "boolean":
      return (tag) => tag.type === "boolean";
    case "temporal-unit":
      return (tag) => tag.type === "temporal-unit";
  }
  return () => false;
}
