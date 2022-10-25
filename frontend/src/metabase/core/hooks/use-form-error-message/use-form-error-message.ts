import { useLayoutEffect, useState } from "react";
import { useFormikContext } from "formik";
import useFormState from "../use-form-state";

const useFormErrorMessage = () => {
  const { values } = useFormikContext();
  const { message } = useFormState();
  const [errorMessage, setErrorMessage] = useState(message);

  useLayoutEffect(() => {
    setErrorMessage(undefined);
  }, [values]);

  useLayoutEffect(() => {
    setErrorMessage(message);
  }, [message]);

  return errorMessage;
};

export default useFormErrorMessage;
