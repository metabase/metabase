import { useCallback } from "react";
import { c, t } from "ttag";
import _ from "underscore";
import type { TestConfig } from "yup";
import * as Yup from "yup";

import { GroupMappingsWidget } from "metabase/admin/settings/components/widgets/GroupMappingsWidget";
import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
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
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/settings";
import {
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components/SettingsSection";
import { Box, Divider, Flex, Group, Radio, Stack } from "metabase/ui";
import type { EnterpriseSettings, Settings } from "metabase-types/api";

import { useUpdateLdapMutation } from "../api/ldap";

const testParentheses: TestConfig<string | null | undefined> = {
  name: "test-parentheses",
  message: "Check your parentheses",
  test: (value) =>
    (value?.match(/\(/g) || []).length === (value?.match(/\)/g) || []).length,
};

const LDAP_SCHEMA = Yup.object({
  "ldap-port": Yup.number().integer().nullable(),
  "ldap-user-filter": Yup.string().nullable().test(testParentheses),
  "ldap-group-membership-filter": Yup.string().nullable().test(testParentheses),
});

export type LdapSettings = Pick<
  EnterpriseSettings,
  | "ldap-enabled"
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

export const SettingsLdapForm = () => {
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const { data: settingValues } = useGetSettingsQuery();
  const [updateLdapSettings] = useUpdateLdapMutation();
  const isEnabled = settingValues?.["ldap-enabled"];

  const handleSubmit = useCallback(
    (values: Partial<LdapSettings>) => {
      return updateLdapSettings({
        ...values,
        "ldap-port": Number(values["ldap-port"]),
        "ldap-enabled": true,
      }).unwrap();
    },
    [updateLdapSettings],
  );

  if (!settingValues) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <SettingsPageWrapper title={t`LDAP`}>
      <PLUGIN_LDAP_FORM_FIELDS.LdapUserProvisioning />
      <FormProvider
        initialValues={getFormValues(settingValues)}
        onSubmit={handleSubmit}
        validationSchema={LDAP_SCHEMA}
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
                    {...getExtraFormFieldProps(settingDetails?.["ldap-host"])}
                  />
                  <FormTextInput
                    name="ldap-port"
                    label={t`LDAP port`}
                    placeholder="389"
                    required
                    type="number"
                    {...getExtraFormFieldProps(settingDetails?.["ldap-port"])}
                  />
                  <FormRadioGroup
                    name="ldap-security"
                    label={t`LDAP security`}
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-security"],
                    )}
                    description={null}
                  >
                    <Group mt={"xxs"}>
                      <Radio value="none" label={t`None`} />
                      <Radio
                        value="ssl"
                        label={c("short for 'Secure Sockets Layer'").t`SSL`}
                      />
                      <Radio value="starttls" label={t`StartTLS`} />
                    </Group>
                  </FormRadioGroup>
                  <FormTextInput
                    name="ldap-bind-dn"
                    label={t`Username or DN`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-bind-dn"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-password"
                    label={t`Password`}
                    type="password"
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-password"],
                    )}
                  />
                </Stack>
              </SettingsSection>
              <SettingsSection
                title={t`User schema`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="ldap-user-base"
                    placeholder="ou=users,dc=example,dc=org"
                    label={t`User search base`}
                    required
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-user-base"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-user-filter"
                    label={t`User filter`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-user-filter"],
                    )}
                  />
                </Stack>
              </SettingsSection>
              <SettingsSection
                title={t`Attributes`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="ldap-attribute-email"
                    label={t`Email attribute`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-attribute-email"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-attribute-firstname"
                    label={t`First name attribute`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-attribute-firstname"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-attribute-lastname"
                    label={t`Last name attribute`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-attribute-lastname"],
                    )}
                  />
                </Stack>
              </SettingsSection>
              <SettingsSection
                title={t`Group mapping`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <GroupMappingsWidget
                    isFormik
                    setting={{ key: "ldap-group-sync" }}
                    onChange={handleSubmit}
                    settingValues={settingValues}
                    mappingSetting="ldap-group-mappings"
                    groupHeading={t`Group name`}
                    groupPlaceholder={t`Group name`}
                  />
                  <FormTextInput
                    name="ldap-group-base"
                    label={t`Group search base`}
                    placeholder="ou=groups,dc=example,dc=org"
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-group-base"],
                    )}
                  />
                  <PLUGIN_LDAP_FORM_FIELDS.LdapGroupMembershipFilter />
                </Stack>
              </SettingsSection>
              <Flex justify="end" gap="1rem">
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

export const getFormValues = (allSettings: Partial<Settings>) => {
  const ldapSettings = _.pick(allSettings, [
    "ldap-host",
    "ldap-port",
    "ldap-security",
    "ldap-bind-dn",
    "ldap-password",
    "ldap-user-base",
    "ldap-user-filter",
    "ldap-attribute-email",
    "ldap-attribute-firstname",
    "ldap-attribute-lastname",
    "ldap-group-sync",
    "ldap-group-base",
    "ldap-group-membership-filter",
  ]);

  return ldapSettings;
};
