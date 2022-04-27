import { getParameterType, getParameterSubType } from "./parameter-type";
import { getParameterOperatorName } from "./operators";
import { TemplateTagVariable } from "metabase-lib/lib/Variable";

export function fieldFilterForParameter(parameter) {
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

export function dimensionFilterForParameter(parameter) {
  const fieldFilter = fieldFilterForParameter(parameter);
  return dimension => fieldFilter(dimension.field());
}

export function getTagOperatorFilterForParameter(parameter) {
  const subtype = getParameterSubType(parameter);
  const parameterOperatorName = getParameterOperatorName(subtype);

  return tag => {
    const { "widget-type": widgetType } = tag;
    const subtype = getParameterSubType(widgetType);
    const tagOperatorName = getParameterOperatorName(subtype);

    return parameterOperatorName === tagOperatorName;
  };
}

export function variableFilterForParameter(parameter) {
  const tagFilter = tagFilterForParameter(parameter);
  return variable => {
    if (variable instanceof TemplateTagVariable) {
      const tag = variable.tag();
      return tag ? tagFilter(tag) : false;
    }
    return false;
  };
}

function tagFilterForParameter(parameter) {
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
