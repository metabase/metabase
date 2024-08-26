import { t } from "ttag";

import { FormMessageStyled } from "./FormMessage.styled";

type Response = {
  status: number;
  data?: {
    message?: string;
  };
};

interface FormMessageProps {
  className?: string;
  message?: string;
  noPadding?: boolean;
  formSuccess?: Response;
  formError?: Response;
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
export const getErrorMessage = (formError?: Response) => {
  if (formError) {
    if (formError.data && formError.data.message) {
      return formError.data.message;
    } else if (formError.status >= 400) {
      return t`Server error encountered`;
    } else {
      return t`Unknown error encountered`;
    }
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
