import { t } from "ttag";
import type { SettingElement } from "./types";

// in order to prevent collection of identifying information only fields
// that are explicitly marked as collectable or booleans should show the true value
export const prepareAnalyticsValue = (setting: any) =>
  setting.allowValueCollection || setting.type === "boolean"
    ? setting.value
    : "success";

export const settingToFormField = (setting: any) => ({
  name: setting.key,
  description: setting.description,
  placeholder: setting.is_env_setting
    ? t`Using ${setting.env_name}`
    : setting.placeholder || setting.default,
  required: setting.required,
  autoFocus: setting.autoFocus,
});

export const settingToFormFieldId = (setting: any) => `setting-${setting.key}`;

export function getSettingsElementWithKnownKey(
  elements: SettingElement[],
  key: string,
) {
  const element = elements.filter(x => x.key === key);
  if (element.length !== 1) {
    const allElementKeys = elements.map(x => x.key).join(", ");
    throw new Error(
      `Key ${key} was expected to be found in the following list of elements: ${allElementKeys}`,
    );
  }
  return element[0];
}
