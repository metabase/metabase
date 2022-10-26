import { useFormikContext } from "formik";
import { FormState } from "./types";

const useFormState = (): FormState => {
  const { status } = useFormikContext();
  return status ?? {};
};

export default useFormState;
