import { getParameterType, getParameterSubType } from "./internal";

export function fieldFilterForParameter(parameter) {
  const type = getParameterType(parameter);
  const subtype = getParameterSubType(parameter);
  switch (type) {
    case "date":
      return field => field.isDate();
    case "id":
      return field => field.isID();
    case "category":
      return field => field.isCategory();
    case "location":
      return field => {
        switch (subtype) {
          case "city":
            return field.isCity();
          case "state":
            return field.isState();
          case "zip_code":
            return field.isZipCode();
          case "country":
            return field.isCountry();
          default:
            return field.isLocation();
        }
      };
    case "number":
      return field => field.isNumber() && !field.isCoordinate();
    case "string":
      return field => {
        return subtype === "=" || subtype === "!="
          ? field.isCategory() && !field.isLocation()
          : field.isString() && !field.isLocation();
      };
  }

  return () => false;
}
