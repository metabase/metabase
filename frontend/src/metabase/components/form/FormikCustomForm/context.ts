import { createContext, useContext } from "react";
import _ from "underscore";

import type { FormLegacyContext } from "./types";

export const FormContext = createContext<FormLegacyContext<any>>({
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
  registerFormField: _.noop,
  unregisterFormField: _.noop,
});

export function useForm() {
  return useContext(FormContext);
}
