import { useContext } from "react";

import type { FormState } from "../../contexts";
import { FormContext } from "../../contexts";

export const useFormContext = (): FormState => {
  return useContext(FormContext);
};
