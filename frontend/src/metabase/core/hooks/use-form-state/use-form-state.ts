import { useFormikContext } from "formik";
import { FormState } from "./types";

const DEFAULT_STATE: FormState = {
  status: "idle",
};

const useFormState = (): FormState => {
  const { status } = useFormikContext();
  return status ?? DEFAULT_STATE;
};

export default useFormState;
