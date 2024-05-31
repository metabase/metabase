import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";

import type { Error, ErrorWithData } from "./types";

const isErrorWithData = (error?: unknown): error is ErrorWithData => {
  return error !== null && typeof error === "object" && "data" in error;
};

export const ErrorComponent = ({
  className,
  error,
  renderError,
}: {
  className?: string;
  error: Error | unknown | null;
  renderError: ((errorMessage: ReactNode) => ReactNode) | undefined;
}) => {
  const getErrorMessage = (): string => {
    let errorMessage = "";

    if (typeof error === "string") {
      errorMessage = error;
    } else if (isErrorWithData(error)) {
      if (typeof error.data === "string") {
        errorMessage = error.data;
      } else if (error.data?.message) {
        errorMessage = error.data.message;
      } else if (error.statusText) {
        errorMessage = error.statusText;
      } else if (error.message) {
        errorMessage = error.message;
      }
    }

    return errorMessage || t`An error occurred`;
  };

  if (renderError) {
    return <div className={CS.py4}>{renderError(getErrorMessage())}</div>;
  }

  return (
    <div className={className}>
      <h2 className={cx(CS.textNormal, CS.textLight, CS.ieWrapContentFix)}>
        {getErrorMessage()}
      </h2>
    </div>
  );
};
