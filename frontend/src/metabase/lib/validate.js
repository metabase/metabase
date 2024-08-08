import { t } from "ttag";

import { isEmail } from "metabase/lib/email";
import Settings from "metabase/lib/settings";

// we need this to allow 0 as a valid form value
export const isEmpty = value =>
  value == null || value === "" || value === undefined;

export const validators = {
  required: () => value => isEmpty(value) && t`required`,
  email: () => value => !isEmail(value) && t`must be a valid email address`,
  maxLength: max => value =>
    value && value.length > max && t`must be ${max} characters or less`,
  passwordComplexity: () => value =>
    Settings.passwordComplexityDescription(value),
};

function makeValidate(steps = []) {
  function validate(...args) {
    return steps.reduce((error, step) => error || step(...args), false);
  }
  function all(...args) {
    return steps.map(step => step(...args)).filter(e => e);
  }
  validate.required = undefined; // to help typescript out
  validate.all = () => all;
  for (const [name, validator] of Object.entries(validators)) {
    validate[name] = (...args) => makeValidate([...steps, validator(...args)]);
  }
  return validate;
}

export default makeValidate();
