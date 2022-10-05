import { isEmpty } from "metabase/lib/validate";

import type {
  ArbitraryParameterForActionExecution,
  WritebackParameter,
  FieldSettings,
} from "metabase-types/api";

import type { Parameter, ParameterId } from "metabase-types/types/Parameter";

type ParameterMap = Record<ParameterId, string | number>;

function getActionParameterType(parameter: Parameter) {
  const { type } = parameter;
  if (type === "category") {
    return "string/=";
  }
  return type;
}

export function formatParametersBeforeSubmit(
  values: ParameterMap,
  missingParameters: WritebackParameter[],
) {
  const formattedParams: ArbitraryParameterForActionExecution[] = [];

  Object.keys(values).forEach(parameterId => {
    const parameter = missingParameters.find(
      parameter => parameter.id === parameterId,
    );
    if (parameter) {
      formattedParams.push({
        value: values[parameterId],
        type: getActionParameterType(parameter),
        target: parameter.target,
      });
    }
  });

  return formattedParams;
}

// set user-defined default values for any non-required empty parameters
export function setDefaultValues(
  params: ParameterMap,
  fieldSettings: { [tagId: string]: FieldSettings },
) {
  Object.entries(params).forEach(([key, value]) => {
    if (isEmpty(value) && fieldSettings[key] && !fieldSettings[key].required) {
      params[key] = fieldSettings[key].defaultValue ?? "";
    }
  });

  return params;
}
