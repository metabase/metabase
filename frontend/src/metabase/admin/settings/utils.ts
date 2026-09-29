import type { FormikHelpers } from "formik";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  SettingDefinition,
} from "metabase-types/api";

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

/** Spread after a field's own props: a setting managed by an env var turns readOnly and shows "Using MB_..." instead of its description */
export const getEnvNoticeProps = (setting?: SettingDefinition) =>
  setting?.is_env_setting ? getExtraFormFieldProps(setting) : {};

// env-locked settings show the readOnly notice instead of a placeholder
export const getDefaultPlaceholder = (
  setting?: SettingDefinition,
): string | undefined => {
  if (setting?.is_env_setting || typeof setting?.default !== "string") {
    return undefined;
  }
  return setting.default;
};

/** The value a form field starts with: an unset setting stays empty so its default shows as the placeholder, while an env-locked one shows the env value */
export const getStoredFieldValue = <Key extends EnterpriseSettingKey>(
  setting: SettingDefinition<Key> | undefined,
  envValue: EnterpriseSettingValue<Key> | undefined,
): NonNullable<EnterpriseSettingValue<Key>> | null => {
  if (setting?.is_env_setting) {
    return envValue ?? null;
  }
  return setting?.value ?? null;
};

/** Puts fields a card just hid back to their saved values, so an unsaved edit never rides along on the next save */
export const resetFieldsToInitial = <Values extends object>(
  setFieldValue: FormikHelpers<Values>["setFieldValue"],
  initialValues: Values,
  fieldNames: (keyof Values & string)[],
) => {
  for (const name of fieldNames) {
    // a key can be missing from the form, like the EE-only membership filter on OSS
    if (name in initialValues) {
      setFieldValue(name, initialValues[name]);
    }
  }
};
