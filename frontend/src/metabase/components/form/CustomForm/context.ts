import { createContext, useContext } from "react";
import _ from "underscore";

import { FormLegacyContext } from "./types";

export const FormContext = createContext<FormLegacyContext>({
  fields: {},
  formFields: [],
  formFieldsByName: {},
  values: {},
  submitting: false,
  invalid: false,
  pristine: true,
  error: undefined,
  disablePristineSubmit: true,
  handleSubmit: _.noop,
  onChangeField: _.noop,
});

export function useForm() {
  return useContext(FormContext);
}
