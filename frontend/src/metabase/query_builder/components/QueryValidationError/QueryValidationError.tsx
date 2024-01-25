import { t } from "ttag";

import type ValidationError from "metabase-lib/ValidationError";

import {
  QueryValidationErrorRoot,
  QueryValidationErrorHeader,
  QueryValidationErrorMessage,
} from "./QueryValidationError.styled";
import ErrorActionButton from "./ErrorActionButton";

export type QueryValidationErrorProps = {
  error: Error | ValidationError;
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
