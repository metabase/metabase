import type { ReactNode } from "react";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import type { SettingDefinition } from "metabase-types/api";

interface SettingWithFormFields {
  key: string;
  display_name?: string;
  description?: string | ReactNode | null;
  is_env_setting?: boolean;
  env_name?: string;
  placeholder?: string;
  default?: string;
  required?: boolean;
  autoFocus?: boolean;
}

interface FormField {
  name: string;
  label?: string;
  description?: string | ReactNode | null;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}

interface ExtraFormFieldProps {
  description: string;
  readOnly?: boolean;
}

export const settingToFormField = (
  setting: SettingWithFormFields,
): FormField => ({
  name: setting.key,
  label: setting.display_name,
  description: setting.description,
  placeholder: setting.is_env_setting
    ? t`Using ${setting.env_name}`
    : setting.placeholder || setting.default,
  required: setting.required,
  autoFocus: setting.autoFocus,
});

export const settingToFormFieldId = (setting: SettingDefinition): string =>
  `setting-${setting.key}`;

export const useGetEnvVarDocsUrl = (envName?: string): string => {
  return useDocsUrl("configuring-metabase/environment-variables", {
    anchor: envName?.toLowerCase(),
  });
};

export const getExtraFormFieldProps = (
  setting?: SettingWithFormFields,
): ExtraFormFieldProps => {
  if (setting?.is_env_setting) {
    return {
      description: t`Using ${setting.env_name}`,
      readOnly: true,
    };
  }
  return {
    description: setting?.description?.toString() ?? "",
  };
};
