import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";

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

import type { Dispatch, ReduxAction } from "metabase-types/store";

import { formatParametersBeforeSubmit, setDefaultValues } from "./utils";

interface Props {
  missingParameters: WritebackParameter[];
  action: WritebackAction;
  onSubmit: (parameters: ArbitraryParameterForActionExecution[]) => ReduxAction;
  onSubmitSuccess: () => void;
  dispatch: Dispatch;
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
      const paramsWithDefaultValues = setDefaultValues(params, fieldSettings);

      const formattedParams = formatParametersBeforeSubmit(
        paramsWithDefaultValues,
        missingParameters,
      );
      dispatch(onSubmit(formattedParams));
      onSubmitSuccess();
    },
    [missingParameters, onSubmit, onSubmitSuccess, dispatch, fieldSettings],
  );

  const submitButtonLabel = getSubmitButtonLabel(action);

  return (
    <Form form={form} onSubmit={handleSubmit} submitTitle={submitButtonLabel} />
  );
}

export default connect()(ActionParametersInputForm);
