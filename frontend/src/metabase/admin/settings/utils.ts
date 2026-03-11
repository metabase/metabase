import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import type { SettingDefinition } from "metabase-types/api";

export const useGetEnvVarDocsUrl = (envName: string | undefined) => {
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
