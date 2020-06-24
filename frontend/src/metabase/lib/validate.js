import { t } from "ttag";
import Utils from "metabase/lib/utils";
import Settings from "metabase/lib/settings";

export const validators = {
  required: () => value => !value && t`required`,
  email: () => value =>
    !Utils.validEmail(value) && t`must be a valid email address`,
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
  validate.all = () => all;
  for (const [name, validator] of Object.entries(validators)) {
    validate[name] = (...args) => makeValidate([...steps, validator(...args)]);
  }
  return validate;
}

export default makeValidate();
