import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import type { SettingDefinition } from "metabase-types/api";

export const useGetEnvVarDocsUrl = (envName: string | undefined) => {
  return useDocsUrl("configuring-metabase/environment-variables", {
    anchor: envName?.toLowerCase(),
  });
};

// Matches SettingHeader's description styling; the metabase/ui Input theme
// default renders field descriptions smaller and darker.
export const SETTINGS_FIELD_DESCRIPTION_PROPS = {
  c: "text-secondary",
  fz: "md",
  lh: "xl",
  maw: "38rem",
} as const;

export const getExtraFormFieldProps = (setting?: SettingDefinition) => {
  if (setting?.is_env_setting) {
    return {
      description: t`Using ${setting.env_name}`,
      descriptionProps: SETTINGS_FIELD_DESCRIPTION_PROPS,
      readOnly: true,
    };
  }
  return {
    description: setting?.description ?? "",
    descriptionProps: SETTINGS_FIELD_DESCRIPTION_PROPS,
  };
};
