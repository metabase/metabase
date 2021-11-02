import _ from "underscore";

export function getParameterType(parameter) {
  return parameter.sectionId || splitType(parameter)[0];
}

export function getParameterSubType(parameter) {
  const [, subtype] = splitType(parameter);
  return subtype;
}

function splitType(parameterOrType) {
  const parameterType = _.isString(parameterOrType)
    ? parameterOrType
    : parameterOrType?.type || "";

  return parameterType.split("/");
}

export function isDateParameter(parameter) {
  const type = getParameterType(parameter);
  return type === "date";
}
