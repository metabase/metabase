import { useLayoutEffect, useState } from "react";
import { useFormikContext } from "formik";
import useFormState from "metabase/core/hooks/use-form-state";

const useFormErrorMessage = () => {
  const { dirty } = useFormikContext();
  const { message } = useFormState();
  const [errorMessage, setErrorMessage] = useState(message);

  useLayoutEffect(() => {
    setErrorMessage(undefined);
  }, [dirty]);

  useLayoutEffect(() => {
    setErrorMessage(message);
  }, [message]);

  return errorMessage;
};

export default useFormErrorMessage;
