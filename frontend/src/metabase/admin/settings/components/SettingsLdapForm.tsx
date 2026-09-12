import { useCallback, useMemo } from "react";
import { c, t } from "ttag";
import type { TestConfig } from "yup";
import * as Yup from "yup";

import {
  CollapsibleSettingsSection,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  getDefaultPlaceholder,
  getExtraFormFieldProps,
} from "metabase/admin/settings/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { PLUGIN_LDAP_FORM_FIELDS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/settings";
import { Box, Flex, Radio, Stack } from "metabase/ui";
import type {
  EnterpriseSettings,
  SettingDefinition,
  SettingDefinitionMap,
} from "metabase-types/api";

import { useUpdateLdapMutation } from "../api/ldap";

import { LdapGroupMappingSection } from "./LdapGroupMappingSection";

const testParentheses: TestConfig<string | null | undefined> = {
  name: "test-parentheses",
  message: "Check your parentheses",
  test: (value) =>
    (value?.match(/\(/g) || []).length === (value?.match(/\)/g) || []).length,
};

// the membership filter is hidden while group mapping is off, so its check must not block the page then
const getLdapSchema = (isGroupMappingOn: boolean) =>
  Yup.object({
    "ldap-port": Yup.number().integer().nullable(),
    "ldap-user-filter": Yup.string().nullable().test(testParentheses),
    "ldap-group-membership-filter": isGroupMappingOn
      ? Yup.string().nullable().test(testParentheses)
      : Yup.string().nullable(),
  });

export type LdapFormValues = Pick<
  EnterpriseSettings,
  | "ldap-host"
  | "ldap-port"
  | "ldap-security"
  | "ldap-bind-dn"
  | "ldap-password"
  | "ldap-user-base"
  | "ldap-user-filter"
  | "ldap-attribute-email"
  | "ldap-attribute-firstname"
  | "ldap-attribute-lastname"
  | "ldap-group-base"
  | "ldap-group-membership-filter"
>;

type LdapTextKey = Exclude<keyof LdapFormValues, "ldap-port" | "ldap-security">;

const LDAP_ATTRIBUTE_KEYS = [
  "ldap-attribute-email",
  "ldap-attribute-firstname",
  "ldap-attribute-lastname",
] as const;

// the backend copy for a few fields predates the design, so the page supplies its own description
const withDescription = (
  setting: SettingDefinition | undefined,
  description: string,
) => {
  const fieldProps = getExtraFormFieldProps(setting);
  return setting?.is_env_setting ? fieldProps : { ...fieldProps, description };
};

// attribute keys show only their default as a placeholder; env-locked ones show the readOnly notice instead
const getAttributeFieldProps = (setting: SettingDefinition | undefined) =>
  setting?.is_env_setting
    ? getExtraFormFieldProps(setting)
    : { placeholder: getDefaultPlaceholder(setting) };

export const SettingsLdapForm = () => {
  const { data: settingDetails, isLoading: isLoadingDetails } =
    useGetAdminSettingsDetailsQuery();
  const { data: settingValues, isLoading: isLoadingValues } =
    useGetSettingsQuery();
  const [updateLdapSettings] = useUpdateLdapMutation();
  const applicationName = useSelector(getApplicationName);
  const isEnabled = settingValues?.["ldap-enabled"];
  const isGroupMappingOn = settingValues?.["ldap-group-sync"] ?? false;
  const schema = useMemo(
    () => getLdapSchema(isGroupMappingOn),
    [isGroupMappingOn],
  );

  const handleSubmit = useCallback(
    (values: LdapFormValues) => {
      return updateLdapSettings({
        ...values,
        "ldap-port": Number(values["ldap-port"]),
        "ldap-enabled": true,
      }).unwrap();
    },
    [updateLdapSettings],
  );

  if (isLoadingDetails || isLoadingValues) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!settingDetails || !settingValues) {
    return (
      <LoadingAndErrorWrapper error={t`Error loading LDAP configuration`} />
    );
  }

  // the card opens by itself once an attribute was customized, in the app or through an env var
  const hasCustomAttributes = LDAP_ATTRIBUTE_KEYS.some((key) => {
    const setting = settingDetails[key];
    return setting?.value != null || (setting?.is_env_setting ?? false);
  });

  return (
    <SettingsPageWrapper title={t`LDAP`}>
      <FormProvider
        initialValues={getFormValues(settingDetails, settingValues)}
        onSubmit={handleSubmit}
        validationSchema={schema}
        enableReinitialize
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="xl">
              <SettingsSection
                title={t`Server settings`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="ldap-host"
                    label={t`LDAP host`}
                    placeholder="ldap.yourdomain.org"
                    required
                    autoFocus
                    {...getExtraFormFieldProps(settingDetails["ldap-host"])}
                  />
                  <FormTextInput
                    name="ldap-port"
                    label={t`LDAP port`}
                    placeholder="389"
                    required
                    type="number"
                    {...getExtraFormFieldProps(settingDetails["ldap-port"])}
                  />
                  <FormRadioGroup
                    name="ldap-security"
                    label={t`LDAP security`}
                    {...getExtraFormFieldProps(settingDetails["ldap-security"])}
                    description={null}
                  >
                    <Stack mt="xxs" gap="sm">
                      <Radio value="none" label={t`None`} />
                      <Radio
                        value="ssl"
                        label={c("short for 'Secure Sockets Layer'").t`SSL`}
                      />
                      <Radio value="starttls" label={t`StartTLS`} />
                    </Stack>
                  </FormRadioGroup>
                  <FormTextInput
                    name="ldap-bind-dn"
                    label={t`Username or DN`}
                    placeholder="cn=admin,dc=company,dc=com"
                    nullable
                    {...getExtraFormFieldProps(settingDetails["ldap-bind-dn"])}
                  />
                  <FormTextInput
                    name="ldap-password"
                    label={t`Password`}
                    type="password"
                    placeholder={t`Shh...`}
                    nullable
                    {...getExtraFormFieldProps(settingDetails["ldap-password"])}
                  />
                </Stack>
              </SettingsSection>
              {/* the card saves on its own, so it stays out of the form's values */}
              <PLUGIN_LDAP_FORM_FIELDS.LdapUserProvisioning />
              <SettingsSection
                title={t`User schema`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="ldap-user-base"
                    label={t`User search base`}
                    placeholder="ou=users,dc=example,dc=org"
                    required
                    {...withDescription(
                      settingDetails["ldap-user-base"],
                      t`The distinguished name (DN) of the entry in your LDAP server that ${applicationName} should use as the starting point when searching for users`,
                    )}
                  />
                  <FormTextInput
                    name="ldap-user-filter"
                    label={t`User filter`}
                    placeholder={getDefaultPlaceholder(
                      settingDetails["ldap-user-filter"],
                    )}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails["ldap-user-filter"],
                    )}
                  />
                </Stack>
              </SettingsSection>
              <CollapsibleSettingsSection
                title={t`Attributes`}
                description={t`Map LDAP attributes to the email, first name, and last name fields in ${applicationName}`}
                defaultOpened={hasCustomAttributes}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="ldap-attribute-email"
                    label={t`Email attribute key`}
                    nullable
                    {...getAttributeFieldProps(
                      settingDetails["ldap-attribute-email"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-attribute-firstname"
                    label={t`First name attribute key`}
                    nullable
                    {...getAttributeFieldProps(
                      settingDetails["ldap-attribute-firstname"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-attribute-lastname"
                    label={t`Last name attribute key`}
                    nullable
                    {...getAttributeFieldProps(
                      settingDetails["ldap-attribute-lastname"],
                    )}
                  />
                </Stack>
              </CollapsibleSettingsSection>
              {/* the switch and the mappings save on their own, only the group fields belong to the form */}
              <LdapGroupMappingSection data-testid="ldap-group-mapping-section">
                <FormTextInput
                  name="ldap-group-base"
                  label={t`Group search base`}
                  placeholder="ou=groups,dc=example,dc=org"
                  nullable
                  {...withDescription(
                    settingDetails["ldap-group-base"],
                    t`Not required for LDAP directories that provide a 'memberOf' overlay, such as Active Directory. It will be searched recursively.`,
                  )}
                />
                <PLUGIN_LDAP_FORM_FIELDS.LdapGroupMembershipFilter />
              </LdapGroupMappingSection>
              <Flex justify="end" gap="md">
                <Box>
                  <FormErrorMessage />
                </Box>
                <FormSubmitButton
                  disabled={!dirty}
                  label={isEnabled ? t`Save changes` : t`Save and enable`}
                  variant="filled"
                />
              </Flex>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </SettingsPageWrapper>
  );
};

export const getFormValues = (
  settingDetails: SettingDefinitionMap,
  settingValues: EnterpriseSettings,
): LdapFormValues => {
  // an unset field stays empty so its default can show as the placeholder, while an env-locked one shows what the env var gives it
  const storedValue = (key: LdapTextKey): string | null => {
    const setting = settingDetails[key];
    if (setting?.is_env_setting) {
      return settingValues[key] ?? null;
    }
    return setting?.value ?? null;
  };

  const values: LdapFormValues = {
    "ldap-host": storedValue("ldap-host"),
    // the connection test needs a port, so the field always shows the one in effect
    "ldap-port": settingValues["ldap-port"],
    "ldap-security": settingValues["ldap-security"] ?? "none",
    "ldap-bind-dn": storedValue("ldap-bind-dn"),
    "ldap-password": storedValue("ldap-password"),
    "ldap-user-base": storedValue("ldap-user-base"),
    "ldap-user-filter": storedValue("ldap-user-filter"),
    "ldap-attribute-email": storedValue("ldap-attribute-email"),
    "ldap-attribute-firstname": storedValue("ldap-attribute-firstname"),
    "ldap-attribute-lastname": storedValue("ldap-attribute-lastname"),
    "ldap-group-base": storedValue("ldap-group-base"),
  };
  // OSS builds have no membership filter setting, so the key stays out of the write
  if (settingDetails["ldap-group-membership-filter"] != null) {
    values["ldap-group-membership-filter"] = storedValue(
      "ldap-group-membership-filter",
    );
  }
  return values;
};
