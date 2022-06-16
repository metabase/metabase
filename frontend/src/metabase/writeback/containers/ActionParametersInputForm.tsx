import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { getTemplateTagType } from "metabase/parameters/utils/cards";

import Form from "metabase/containers/Form";
import { TemplateTag } from "metabase-types/types/Query";

type MappedParameters = Record<string, { type: string; value: string }>;

interface Props {
  missingParameters: TemplateTag[];
  onSubmit: (parameters: MappedParameters) => { type: string; payload: any };
  onSubmitSuccess: () => void;
  dispatch: (action: any) => void;
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

function ActionParametersInputForm({
  missingParameters,
  dispatch,
  onSubmit,
  onSubmitSuccess,
}: Props) {
  const form = useMemo(
    () => ({
      fields: missingParameters.map(tag => ({
        name: tag.id,
        title: tag["display-name"],
        ...getTemplateTagFieldProps(tag),
      })),
    }),
    [missingParameters],
  );

  const handleSubmit = useCallback(
    params => {
      const formattedParams: MappedParameters = {};

      Object.keys(params).forEach(paramId => {
        const tag = missingParameters.find(tag => tag.id === paramId);
        if (tag) {
          formattedParams[paramId] = {
            value: params[paramId],
            type: getTemplateTagType(tag),
          };
        }
      });

      dispatch(onSubmit(formattedParams));
      onSubmitSuccess();
    },
    [missingParameters, onSubmit, onSubmitSuccess, dispatch],
  );

  return <Form form={form} onSubmit={handleSubmit} submitTitle={t`Execute`} />;
}

export default connect()(ActionParametersInputForm);
