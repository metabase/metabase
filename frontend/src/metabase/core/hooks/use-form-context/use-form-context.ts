import { useContext } from "react";
import { FormContext } from "metabase/forms";
import type { FormState } from "metabase/forms";

const useFormContext = (): FormState => {
  return useContext(FormContext);
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useFormContext;
