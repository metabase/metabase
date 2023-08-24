import { useContext } from "react";
import type { FormState } from "metabase/core/context/FormContext";
import FormContext from "metabase/core/context/FormContext";

const useFormContext = (): FormState => {
  return useContext(FormContext);
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useFormContext;
