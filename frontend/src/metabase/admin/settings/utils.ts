import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import type { SettingDefinition } from "metabase-types/api";

export const settingToFormField = (setting: SettingDefinition) => ({
  name: setting.key,
  label: setting.display_name,
  description: setting.description,
  placeholder: setting.is_env_setting
    ? t`Using ${setting.env_name}`
    : setting.placeholder || setting.default,
  required: setting.required,
  autoFocus: setting.autoFocus,
});

export const settingToFormFieldId = (setting: SettingDefinition) =>
  `setting-${setting.key}`;

export const useGetEnvVarDocsUrl = (envName?: string) => {
  return useDocsUrl("configuring-metabase/environment-variables", {
    anchor: envName?.toLowerCase(),
  });
};

export const getExtraFormFieldProps = (setting?: SettingDefinition) => {
  if (setting?.is_env_setting) {
    return {
      description: t`Using ${setting.env_name}`,
      readOnly: true,
    };
  }
  return {
    description: setting?.description ?? "",
  };
};
