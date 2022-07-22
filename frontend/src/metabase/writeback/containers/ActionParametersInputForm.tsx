import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import {
  getActionTemplateTagType,
  getActionParameterType,
} from "metabase/writeback/utils";

import Form from "metabase/containers/Form";
import { TemplateTag } from "metabase-types/types/Query";
import { Parameter, ParameterId } from "metabase-types/types/Parameter";

type MappedParameters = Record<
  string,
  { type: string; value: string | number }
>;

interface Props {
  missingParameters: TemplateTag[] | Parameter[];
  onSubmit: (parameters: MappedParameters) => { type: string; payload: any };
  onSubmitSuccess: () => void;
  dispatch: (action: any) => void;
}
function isTemplateTag(
  tagOrParameter: TemplateTag | Parameter,
): tagOrParameter is TemplateTag {
  return "display-name" in tagOrParameter;
}

function getTemplateTagFieldProps(tag: TemplateTag) {
  if (tag.type === "date") {
    return { type: "date" };
  }
  if (tag.type === "number") {
    return { type: "integer" };
  }
  return { type: "input" };
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

function getFormFieldForTemplateTag(tag: TemplateTag) {
  return {
    name: tag.id,
    title: tag["display-name"],
    ...getTemplateTagFieldProps(tag),
  };
}

function getFormFieldForParameter(parameter: Parameter) {
  return {
    name: parameter.id,
    title: parameter.name,
    ...getParameterFieldProps(parameter),
  };
}

function formatTemplateTagsBeforeSubmit(
  values: Record<ParameterId, string | number>,
  missingParameters: TemplateTag[],
) {
  const formattedParams: MappedParameters = {};

  Object.keys(values).forEach(parameterId => {
    const tag = missingParameters.find(tag => tag.id === parameterId);
    if (tag) {
      formattedParams[parameterId] = {
        value: values[parameterId],
        type: getActionTemplateTagType(tag),
      };
    }
  });

  return formattedParams;
}

function formatParametersBeforeSubmit(
  values: Record<ParameterId, string | number>,
  missingParameters: Parameter[],
) {
  const formattedParams: MappedParameters = {};

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
      fields: missingParameters.map(tagOrParameter => {
        const isTag = isTemplateTag(tagOrParameter);
        return isTag
          ? getFormFieldForTemplateTag(tagOrParameter)
          : getFormFieldForParameter(tagOrParameter);
      }),
    };
  }, [missingParameters]);

  const handleSubmit = useCallback(
    params => {
      const [sampleParameter] = missingParameters;
      const formattedParams = isTemplateTag(sampleParameter)
        ? formatTemplateTagsBeforeSubmit(
            params,
            missingParameters as TemplateTag[],
          )
        : formatParametersBeforeSubmit(
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
