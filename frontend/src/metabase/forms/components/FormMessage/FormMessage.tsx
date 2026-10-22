import cx from "classnames";
import { t } from "ttag";

import { Box } from "metabase/ui";
import { isObject } from "metabase-types/guards";

import S from "./FormMessage.module.css";

export type Response = {
  status: number;
  data?: {
    message?: string;
  };
};

function isResponse(value: unknown): value is Response {
  return (
    isObject(value) &&
    "status" in value &&
    typeof value.status === "number" &&
    (value.data === undefined ||
      (isObject(value.data) && typeof value.data.message === "string"))
  );
}

interface FormMessageProps {
  className?: string;
  message?: string;
  noPadding?: boolean;
  formSuccess?: Response;
  formError?: unknown;
}

const getMessage = ({
  message,
  formError,
  formSuccess,
}: Pick<FormMessageProps, "message" | "formError" | "formSuccess">) => {
  if (message) {
    return message;
  }
  if (formError) {
    return getErrorMessage(formError);
  }
  return getSuccessMessage(formSuccess);
};

/**
 * @deprecated
 */
export const getErrorMessage = (formError?: unknown) => {
  if (isResponse(formError)) {
    if (formError.data?.message) {
      return formError.data.message;
    } else if (formError.status >= 400) {
      return t`Server error encountered`;
    }
  }
  if (formError) {
    return t`Unknown error encountered`;
  }
};

/**
 * @deprecated
 */
export const getSuccessMessage = (formSuccess?: Response) => {
  return formSuccess?.data?.message;
};

export function FormMessage({
  className,
  message,
  formSuccess,
  formError,
  noPadding,
}: FormMessageProps) {
  const treatedMessage = getMessage({ message, formSuccess, formError });
  return (
    <Box
      component="span"
      className={cx(S.root, className, { [S.visible]: Boolean(message) })}
      c={formSuccess ? "feedback-positive" : "feedback-negative"}
      pb={noPadding ? undefined : "lg"}
      w="100%"
    >
      {treatedMessage}
    </Box>
  );
}
