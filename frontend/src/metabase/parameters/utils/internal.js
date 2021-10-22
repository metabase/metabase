import MetabaseSettings from "metabase/lib/settings";
import _ from "underscore";

export function areFieldFilterOperatorsEnabled() {
  return MetabaseSettings.get("field-filter-operators-enabled?");
}

export function getParameterType(parameter) {
  const { sectionId } = parameter;
  return sectionId || splitType(parameter)[0];
}

export function getParameterSubType(parameter) {
  const [, subtype] = splitType(parameter);
  return subtype;
}

function splitType(parameterOrType) {
  const parameterType = _.isString(parameterOrType)
    ? parameterOrType
    : (parameterOrType || {}).type || "";
  return parameterType.split("/");
}

export function getOperatorDisplayName(option, operatorType, sectionName) {
  if (operatorType === "date" || operatorType === "number") {
    return option.name;
  } else if (operatorType === "string" && option.operator === "=") {
    return sectionName;
  } else {
    return `${sectionName} ${option.name.toLowerCase()}`;
  }
}
