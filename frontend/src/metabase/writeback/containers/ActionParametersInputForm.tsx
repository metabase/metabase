import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Form from "metabase/containers/Form";

import type {
  ArbitraryParameterForActionExecution,
  WritebackParameter,
} from "metabase-types/api";
import type { Parameter, ParameterId } from "metabase-types/types/Parameter";
import type { Dispatch, ReduxAction } from "metabase-types/store";

interface Props {
  missingParameters: WritebackParameter[];
  onSubmit: (parameters: ArbitraryParameterForActionExecution[]) => ReduxAction;
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
        missingParameters,
      );
      dispatch(onSubmit(formattedParams));
      onSubmitSuccess();
    },
    [missingParameters, onSubmit, onSubmitSuccess, dispatch],
  );

  return <Form form={form} onSubmit={handleSubmit} submitTitle={t`Execute`} />;
}

export default connect()(ActionParametersInputForm);
