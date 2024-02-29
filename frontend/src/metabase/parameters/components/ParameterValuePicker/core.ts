import {
  getNumberParameterArity,
  getStringParameterArity,
} from "metabase-lib/parameters/utils/operators";
import {
  isNumberParameter,
  isStringParameter,
} from "metabase-lib/parameters/utils/parameter-type";
import type { Parameter } from "metabase-types/api";

export function isPlainInput(parameter: Parameter) {
  if (
    isStringParameter(parameter) &&
    getStringParameterArity(parameter) === 1
  ) {
    return true;
  }

  if (
    isNumberParameter(parameter) &&
    getNumberParameterArity(parameter) === 1
  ) {
    return true;
  }

  return false;
}
