import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import * as Yup from "yup";
import type { TestConfig } from "yup";

import { updateLdapSettings } from "metabase/admin/settings/settings";

import { Stack, Group, Radio } from "metabase/ui";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { FormSection } from "metabase/containers/FormikForm";
import GroupMappingsWidget from "metabase/admin/settings/containers/GroupMappingsWidget";
import type { SettingValue } from "metabase-types/api";
import type { SettingElement } from "metabase/admin/settings/types";

const testParentheses: TestConfig<string | null | undefined> = {
  name: "test-parentheses",
  message: "Check your parentheses",
  test: value =>
    (value?.match(/\(/g) || []).length === (value?.match(/\)/g) || []).length,
};

const testPort: TestConfig<string | null | undefined> = {
  name: "test-port",
  message: "That's not a valid port number",
  test: value => Boolean((value || "").trim().match(/^\d*$/)),
};

const LDAP_SCHEMA = Yup.object({
  "ldap-port": Yup.string().nullable().test(testPort),
  "ldap-user-filter": Yup.string().nullable().test(testParentheses),
  "ldap-group-membership-filter": Yup.string().nullable().test(testParentheses),
});

export type SettingValues = { [key: string]: SettingValue };

type LdapFormSettingElement = Omit<SettingElement, "key"> & {
  key: string; // ensuring key is required
  is_env_setting?: boolean;
  env_name?: string;
  default?: any;
};

type Props = {
  elements: LdapFormSettingElement[];
  settingValues: SettingValues;
  onSubmit: (values: SettingValues) => void;
};

export const SettingsLdapFormView = ({
  elements = [],
  settingValues,
  onSubmit,
}: Props) => {
  const isEnabled = settingValues["ldap-enabled"];

  const settings = useMemo(() => {
    return _.indexBy(elements, "key");
  }, [elements]);

  const fields = useMemo(() => {
    return _.mapObject(settings, setting => ({
      name: setting.key,
      label: setting.display_name,
      description: setting.description,
      placeholder: setting.is_env_setting
        ? t`Using ${setting.env_name}`
        : setting.placeholder || setting.default,
      required: setting.required,
      autoFocus: setting.autoFocus,
    }));
  }, [settings]);

  const attributeValues = useMemo(() => {
    return getAttributeValues(settingValues);
  }, [settingValues]);

  const handleSubmit = useCallback(
    values => {
      return onSubmit({
        ...values,
        "ldap-port": values["ldap-port"]?.trim(),
        "ldap-enabled": true,
      });
    },
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={attributeValues}
      onSubmit={handleSubmit}
      validationSchema={LDAP_SCHEMA}
      enableReinitialize
    >
      {({ dirty }) => (
        <Form m="0 1rem" maw="32.5rem">
          <Breadcrumbs
            className="mb3"
            crumbs={[
              [t`Authentication`, "/admin/settings/authentication"],
              [t`LDAP`],
            ]}
          />
          <FormSection title={"Server Settings"}>
            <Stack spacing="md">
              <FormTextInput {...fields["ldap-host"]} />
              <FormTextInput {...fields["ldap-port"]} />
              <FormRadioGroup {...fields["ldap-security"]}>
                <Group mt={"xs"}>
                  <Radio value="none" label="None" />
                  <Radio value="ssl" label="SSL" />
                  <Radio value="starttls" label="StartTLS" />
                </Group>
              </FormRadioGroup>
              <FormTextInput {...fields["ldap-bind-dn"]} />
              <FormTextInput {...fields["ldap-password"]} type="password" />
            </Stack>
          </FormSection>
          <FormSection title={"User Schema"}>
            <Stack spacing="md">
              <FormTextInput {...fields["ldap-user-base"]} />
              <FormTextInput {...fields["ldap-user-filter"]} />
            </Stack>
          </FormSection>
          <FormSection title={"Attributes"} collapsible>
            <Stack spacing="md">
              <FormTextInput {...fields["ldap-attribute-email"]} />
              <FormTextInput {...fields["ldap-attribute-firstname"]} />
              <FormTextInput {...fields["ldap-attribute-lastname"]} />
            </Stack>
          </FormSection>
          <FormSection title={"Group Schema"}>
            <Stack spacing={"md"}>
              <GroupMappingsWidget
                isFormik
                setting={{ key: "ldap-group-sync" }}
                onChange={handleSubmit}
                settingValues={settingValues}
                mappingSetting="ldap-group-mappings"
                groupHeading={t`Group Name`}
                groupPlaceholder={t`Group Name`}
              />
              <FormTextInput {...fields["ldap-group-base"]} />
              {"ldap-group-membership-filter" in fields &&
                "ldap-group-membership-filter" in settingValues && (
                  <FormTextInput {...fields["ldap-group-membership-filter"]} />
                )}
              {"ldap-sync-admin-group" in fields &&
                "ldap-sync-admin-group" in settingValues && (
                  <FormSwitch {...fields["ldap-sync-admin-group"]} />
                )}
            </Stack>
          </FormSection>
          <Stack align="start" spacing="1rem" mb="1rem">
            <FormErrorMessage />
            <FormSubmitButton
              disabled={!dirty}
              label={isEnabled ? t`Save changes` : t`Save and enable`}
              variant="filled"
            />
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
};

const LDAP_ATTRS = [
  // Server Settings
  "ldap-host",
  "ldap-port",
  "ldap-security",
  "ldap-bind-dn",
  "ldap-password",

  // User Schema
  "ldap-user-base",
  "ldap-user-filter",

  // Attributes
  "ldap-attribute-email",
  "ldap-attribute-firstname",
  "ldap-attribute-lastname",

  // Group Schema
  "ldap-group-sync",
  "ldap-group-base",
  "ldap-group-membership-filter",
  "ldap-sync-admin-group",
];

const getAttributeValues = (values: SettingValues) => {
  return Object.fromEntries(LDAP_ATTRS.map(key => [key, values[key]]));
};

const mapDispatchToProps = {
  onSubmit: updateLdapSettings,
};

export const SettingsLdapForm = connect(
  null,
  mapDispatchToProps,
)(SettingsLdapFormView);
