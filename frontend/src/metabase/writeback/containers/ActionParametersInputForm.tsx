import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Form from "metabase/containers/Form";
import {
  getFormFieldForParameter,
  getSubmitButtonLabel,
} from "metabase/writeback/components/ActionCreator/FormCreator";

import type {
  ArbitraryParameterForActionExecution,
  WritebackParameter,
  WritebackAction,
} from "metabase-types/api";
import type { Parameter, ParameterId } from "metabase-types/types/Parameter";
import type { Dispatch, ReduxAction } from "metabase-types/store";

interface Props {
  missingParameters: WritebackParameter[];
  action: WritebackAction;
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
  action,
  dispatch,
  onSubmit,
  onSubmitSuccess,
}: Props) {
  const fieldSettings = useMemo(
    () => action.visualization_settings?.fields ?? {},
    [action],
  );

  const form = useMemo(() => {
    return {
      fields: missingParameters.map(param =>
        getFormFieldForParameter(param, fieldSettings[param.id]),
      ),
    };
  }, [missingParameters, fieldSettings]);

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

  const submitButtonLabel = getSubmitButtonLabel(action);

  return (
    <Form form={form} onSubmit={handleSubmit} submitTitle={submitButtonLabel} />
  );
}

export default connect()(ActionParametersInputForm);
