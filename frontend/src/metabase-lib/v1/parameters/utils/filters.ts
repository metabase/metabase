import * as Lib from "metabase-lib";
import type { TemplateTagDimension } from "metabase-lib/v1/Dimension";
import type Field from "metabase-lib/v1/metadata/Field";
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

export function fieldFilterForParameter(
  parameter: Parameter | string,
): (field: Field) => boolean {
  return (field) =>
    isParameterCompatibleWithColumn(parameter, {
      isString: field.isString(),
      isNumeric: field.isNumeric(),
      isBoolean: field.isBoolean(),
      isTemporal: field.isDate(),
      isID: field.isID(),
      isAddress: field.isAddress(),
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
  }
  return () => false;
}
