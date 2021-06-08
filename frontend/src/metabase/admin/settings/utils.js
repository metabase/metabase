import { t } from "ttag";

// in order to prevent collection of identifying information only fields
// that are explicitly marked as collectable or booleans should show the true value
export const prepareAnalyticsValue = setting =>
  setting.allowValueCollection || setting.type === "boolean"
    ? setting.value
    : "success";

export const settingToFormField = setting => ({
  name: setting.key,
  description: setting.description,
  placeholder: setting.is_env_setting
    ? t`Using ${setting.env_name}`
    : setting.placeholder || setting.default,
  validate: setting.required ? value => !value && "required" : null,
});
