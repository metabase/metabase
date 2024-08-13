import * as Lib from "metabase-lib";
import type Dimension from "metabase-lib/v1/Dimension";
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
      return field => field.isDate();
    case "id":
      return field => field.isID();
    case "category":
      return field => field.isCategory();
    case "location":
      return field => field.isLocation();
    case "number":
      return field => field.isNumber() && !field.isCoordinate();
    case "string":
      return field => field.isString() && !field.isLocation();
  }

  return () => false;
}

export function columnFilterForParameter(
  parameter: Parameter | string,
): (column: Lib.ColumnMetadata) => boolean {
  const type = getParameterType(parameter);
  switch (type) {
    case "date":
      return column => Lib.isTemporal(column);
    case "id":
      return column => Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
    case "category":
      return column => Lib.isCategory(column);
    case "location":
      return column => Lib.isLocation(column);
    case "number":
      return column => Lib.isNumber(column) && !Lib.isLocation(column);
    case "string":
      return column =>
        Lib.isStringOrStringLike(column) && !Lib.isLocation(column);
  }

  return () => false;
}

export function dimensionFilterForParameter(parameter: Parameter | string) {
  const fieldFilter = fieldFilterForParameter(parameter);
  return (dimension: Dimension) => fieldFilter(dimension.field());
}

export function getTagOperatorFilterForParameter(
  parameter: Parameter | string,
) {
  const subtype = getParameterSubType(parameter);
  const parameterOperatorName = getParameterOperatorName(subtype);

  return (tag: TemplateTag) => {
    const { "widget-type": widgetType = "" } = tag;
    const subtype = getParameterSubType(widgetType);
    const tagOperatorName = getParameterOperatorName(subtype);

    return parameterOperatorName === tagOperatorName;
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
      return tag => subtype === "single" && tag.type === "date";
    case "location":
      return tag => tag.type === "number" || tag.type === "text";
    case "id":
      return tag => tag.type === "number" || tag.type === "text";
    case "category":
      return tag => tag.type === "number" || tag.type === "text";
    case "number":
      return tag => tag.type === "number";
    case "string":
      return tag => tag.type === "text";
  }
  return () => false;
}
