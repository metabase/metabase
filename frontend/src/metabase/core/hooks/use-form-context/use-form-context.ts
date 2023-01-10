import { useContext } from "react";
import FormContext, { FormState } from "metabase/core/context/FormContext";

const useFormContext = (): FormState => {
  return useContext(FormContext);
};

export default useFormContext;
