import { useContext } from "react";

import type { FormContextType } from "../../contexts";
import { FormContext } from "../../contexts";

export const useFormContext = (): FormContextType => {
  return useContext(FormContext);
};
