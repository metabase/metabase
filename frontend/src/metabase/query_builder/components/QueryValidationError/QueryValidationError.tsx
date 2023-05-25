import React from "react";
import { t } from "ttag";

import ValidationError from "metabase-lib/ValidationError";

import {
  QueryValidationErrorRoot,
  QueryValidationErrorHeader,
  QueryValidationErrorMessage,
} from "./QueryValidationError.styled";
import ErrorActionButton from "./ErrorActionButton";

type QueryBuilderUiControls = {
  isShowingTemplateTagsEditor?: boolean;
};

export type QueryValidationErrorProps = {
  error: Error | ValidationError;
};

type ErrorActionButton = QueryValidationErrorProps & {
  uiControls: QueryBuilderUiControls;
  toggleTemplateTagsEditor: () => void;
};

function QueryValidationError({ error }: QueryValidationErrorProps) {
  return (
    <QueryValidationErrorRoot>
      <QueryValidationErrorHeader>{t`Something's wrong with your question`}</QueryValidationErrorHeader>
      <QueryValidationErrorMessage>{error.message}</QueryValidationErrorMessage>
      <ErrorActionButton error={error} />
    </QueryValidationErrorRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QueryValidationError;
