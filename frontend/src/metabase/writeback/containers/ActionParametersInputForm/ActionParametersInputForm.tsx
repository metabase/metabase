import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { useDataAppContext } from "metabase/writeback/containers/DataAppContext";
import { getActionParameterType } from "metabase/writeback/utils";
import { ParametersMappedToValues } from "metabase/writeback/types";

import RootForm from "metabase/containers/Form";
import { Parameter, ParameterId } from "metabase-types/types/Parameter";
import { Dispatch } from "metabase-types/store";

import { FormDescription } from "./ActionParametersInputForm.styled";

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
  description,
  missingParameters,
  dispatch,
  onSubmit,
  onSubmitSuccess,
}: Props) {
  const dataAppContext = useDataAppContext();

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

  return (
    <RootForm form={form} onSubmit={handleSubmit} submitTitle={t`Execute`}>
      {({ Form, FormField, FormFooter, formFields }: any) => (
        <Form>
          {description && (
            <FormDescription>
              {dataAppContext.format(description)}
            </FormDescription>
          )}
          {formFields.map((field: any) => (
            <FormField key={field.name} name={field.name} />
          ))}
          <FormFooter />
        </Form>
      )}
    </RootForm>
  );
}

export default connect()(ActionParametersInputForm);
