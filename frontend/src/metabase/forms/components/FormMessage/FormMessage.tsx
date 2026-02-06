import { t } from "ttag";

import { FormMessageStyled } from "./FormMessage.styled";

export type Response = {
  status: number;
  data?: {
    message?: string;
  };
};

function isResponse(value: unknown): value is Response {
  return (
    value != null &&
    typeof value === "object" &&
    "status" in value &&
    typeof (value as Response).status === "number"
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
    <FormMessageStyled
      className={className}
      visible={!!message}
      noPadding={noPadding}
      hasSucceeded={!!formSuccess}
    >
      {treatedMessage}
    </FormMessageStyled>
  );
}
