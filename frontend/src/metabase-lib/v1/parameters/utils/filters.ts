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
import type { Parameter, TemplateTag } from "metabase-types/api";

export function fieldFilterForParameter(
  parameter: Parameter | string,
): (field: Field) => boolean {
  const type = getParameterType(parameter);
  switch (type) {
    case "date":
      return (field) => field.isDate();
    case "id":
      return (field) => field.isID();
    case "category":
      return (field) => field.has_field_values === "list";
    case "location":
      return (field) => field.isLocation();
    case "number":
      return (field) =>
        field.isNumeric() && !field.isID() && !field.isCoordinate();
    case "string":
      return (field) => {
        const isString = field.isString();
        const isNumeric = field.isNumeric();
        const isBoolean = field.isBoolean();
        const hasFieldValues = field.has_field_values === "list";
        const isLocation = field.isLocation();
        return (
          (isString || ((isNumeric || isBoolean) && hasFieldValues)) &&
          !isLocation
        );
      };
  }

  return () => false;
}

export function columnFilterForParameter(
  query: Lib.Query,
  stageIndex: number,
  parameter: Parameter | string,
): (column: Lib.ColumnMetadata) => boolean {
  const type = getParameterType(parameter);

  switch (type) {
    case "date":
      return (column) => Lib.isTemporal(column);
    case "id":
      return (column) => Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
    case "category":
      return (column) =>
        Lib.fieldValuesSearchInfo(query, column).hasFieldValues === "list";
    case "location":
      return (column) => Lib.isLocation(column);
    case "number":
      return (column) =>
        Lib.isNumeric(column) &&
        !Lib.isPrimaryKey(column) &&
        !Lib.isForeignKey(column) &&
        !Lib.isLocation(column);
    case "string":
      return (column) => {
        const isString = Lib.isStringOrStringLike(column);
        const isNumeric = Lib.isNumeric(column);
        const isBoolean = Lib.isBoolean(column);
        const hasFieldValues =
          Lib.fieldValuesSearchInfo(query, column).hasFieldValues === "list";
        const isLocation = Lib.isLocation(column);
        return (
          (isString || ((isNumeric || isBoolean) && hasFieldValues)) &&
          !isLocation
        );
      };
    case "temporal-unit":
      return (column) => Lib.isTemporalBucketable(query, stageIndex, column);
  }

  return () => false;
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
