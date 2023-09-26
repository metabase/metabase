import { useContext } from "react";
import { FormContext } from "../../contexts";
import type { FormState } from "../../contexts";

export const useFormContext = (): FormState => {
  return useContext(FormContext);
};
