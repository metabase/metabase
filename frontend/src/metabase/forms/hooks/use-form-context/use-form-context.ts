import { useContext } from "react";

import type { IFormContext } from "../../contexts";
import { FormContext } from "../../contexts";

export const useFormContext = (): IFormContext => {
  return useContext(FormContext);
};
