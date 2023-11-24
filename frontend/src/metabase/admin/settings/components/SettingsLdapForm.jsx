import { useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import * as Yup from "yup";

import { updateLdapSettings } from "metabase/admin/settings/settings";

import { Stack, Group, Radio } from "metabase/ui";
import {
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { FormSection } from "metabase/containers/FormikForm";
import GroupMappingsWidget from "metabase/admin/settings/containers/GroupMappingsWidget";

import { LdapForm, LdapFormFooter } from "./SettingsLdapForm.styled";

const propTypes = {
  elements: PropTypes.array,
  settingValues: PropTypes.object.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

const testParentheses = {
  name: "test-parentheses",
  message: "Check your parentheses",
  test: value =>
    (value?.match(/\(/g) || []).length === (value?.match(/\)/g) || []).length,
};

const testPort = {
  name: "test-port",
  message: "That's not a valid port number",
  test: value => (value || "").trim().match(/^\d*$/),
};

const LDAP_SCHEMA = Yup.object({
  "ldap-port": Yup.string().nullable().test(testPort),
  "ldap-user-filter": Yup.string().nullable().test(testParentheses),
  "ldap-group-membership-filter": Yup.string().nullable().test(testParentheses),
});

const SettingsLdapForm = ({
  elements = [],
  settingValues,
  onSubmit,
  ...props
}) => {
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
        <LdapForm>
          <Breadcrumbs
            className="mb3"
            crumbs={[
              [t`Authentication`, "/admin/settings/authentication"],
              [t`LDAP`],
            ]}
          />
          <FormSection title={"Server Settings"}>
            <Stack gap="md">
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
            <Stack gap="md">
              <FormTextInput {...fields["ldap-user-base"]} />
              <FormTextInput {...fields["ldap-user-filter"]} />
            </Stack>
          </FormSection>
          <FormSection title={"Attributes"} collapsible>
            <Stack gap="md">
              <FormTextInput {...fields["ldap-attribute-email"]} />
              <FormTextInput {...fields["ldap-attribute-firstname"]} />
              <FormTextInput {...fields["ldap-attribute-lastname"]} />
            </Stack>
          </FormSection>
          <FormSection title={"Group Schema"}>
            <Stack gap={"md"}>
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
              {"ldap-group-membership-filter" in fields && (
                <FormTextInput {...fields["ldap-group-membership-filter"]} />
              )}
            </Stack>
          </FormSection>
          <LdapFormFooter>
            <FormErrorMessage />
            <FormSubmitButton
              disabled={!dirty}
              label={isEnabled ? t`Save changes` : t`Save and enable`}
              variant="filled"
            />
          </LdapFormFooter>
        </LdapForm>
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
];

const getAttributeValues = values => {
  return Object.fromEntries(LDAP_ATTRS.map(key => [key, values[key]]));
};

SettingsLdapForm.propTypes = propTypes;

const mapDispatchToProps = {
  onSubmit: updateLdapSettings,
};

export default connect(null, mapDispatchToProps)(SettingsLdapForm);
