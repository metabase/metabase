import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Form from "metabase/containers/Form";

import type { ParametersMappedToValues } from "metabase-types/api";
import type { Parameter, ParameterId } from "metabase-types/types/Parameter";
import type { Dispatch } from "metabase-types/store";

interface Props {
  description?: string;
  missingParameters: Parameter[];
  onSubmit: (parameters: ParametersMappedToValues) => {
    type: string;
    payload: any;
  };
  onSubmitSuccess: () => void;
  dispatch: Dispatch;
}

function getActionParameterType(parameter: Parameter) {
  const { type } = parameter;
  if (type === "category") {
    return "string/=";
  }
  return type;
}

function getParameterFieldProps(parameter: Parameter) {
  if (parameter.type === "date/single") {
    return { type: "date" };
  }
  if (parameter.type === "number/=") {
    return { type: "integer" };
  }
  return { type: "input" };
}

function getFormFieldForParameter(parameter: Parameter) {
  return {
    name: parameter.id,
    title: parameter.name,
    ...getParameterFieldProps(parameter),
  };
}

function formatParametersBeforeSubmit(
  values: Record<ParameterId, string | number>,
  missingParameters: Parameter[],
) {
  const formattedParams: ParametersMappedToValues = {};

  Object.keys(values).forEach(parameterId => {
    const parameter = missingParameters.find(tag => tag.id === parameterId);
    if (parameter) {
      formattedParams[parameterId] = {
        value: values[parameterId],
        type: getActionParameterType(parameter),
      };
    }
  });

  return formattedParams;
}

function ActionParametersInputForm({
  missingParameters,
  dispatch,
  onSubmit,
  onSubmitSuccess,
}: Props) {
  const form = useMemo(() => {
    return {
      fields: missingParameters.map(getFormFieldForParameter),
    };
  }, [missingParameters]);

  const handleSubmit = useCallback(
    params => {
      const formattedParams = formatParametersBeforeSubmit(
        params,
        missingParameters as Parameter[],
      );
      dispatch(onSubmit(formattedParams));
      onSubmitSuccess();
    },
    [missingParameters, onSubmit, onSubmitSuccess, dispatch],
  );

  return <Form form={form} onSubmit={handleSubmit} submitTitle={t`Execute`} />;
}

export default connect()(ActionParametersInputForm);
