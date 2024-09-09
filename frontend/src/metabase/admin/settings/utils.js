import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";

export const settingToFormField = setting => ({
  name: setting.key,
  label: setting.display_name,
  description: setting.description,
  placeholder: setting.is_env_setting
    ? t`Using ${setting.env_name}`
    : setting.placeholder || setting.default,
  required: setting.required,
  autoFocus: setting.autoFocus,
});

export const settingToFormFieldId = setting => `setting-${setting.key}`;

export const useGetEnvVarDocsUrl = envName => {
  return useDocsUrl(
    "configuring-metabase/environment-variables",
    envName?.toLowerCase(),
  );
};
