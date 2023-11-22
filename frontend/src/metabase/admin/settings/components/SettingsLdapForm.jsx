import { useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import { updateLdapSettings } from "metabase/admin/settings/settings";

import {
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
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
  console.error(fields); // TODO: remove

  const attributeValues = useMemo(() => {
    return getAttributeValues(settingValues);
  }, [settingValues]);

  const handleSubmit = useCallback(
    values => {
      return onSubmit({ ...values, "ldap-enabled": true });
    },
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={attributeValues}
      onSubmit={handleSubmit}
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
          <FormSection title={"Group Schema"}>
            <GroupMappingsWidget
              isFormik
              setting={{ key: "ldap-group-sync" }}
              onChange={handleSubmit}
              settingValues={settingValues}
              mappingSetting="ldap-group-mappings"
              groupHeading={t`Group Name`}
              groupPlaceholder={t`Group Name`}
            />
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

  // Attributes (collapsible)
  "ldap-attribute-email",
  "ldap-attribute-firstname",
  "ldap-attribute-lastname",

  // Group Schema
  "ldap-group-sync",
  "ldap-group-base",
  "ldap-group-membership-filter", // if hasPremiumFeature("sso_ldap")
  "ldap-sync-admin-group", // if hasPremiumFeature("sso_ldap")
];

const getAttributeValues = values => {
  return Object.fromEntries(LDAP_ATTRS.map(key => [key, values[key]]));
};

SettingsLdapForm.propTypes = propTypes;

const mapDispatchToProps = {
  onSubmit: updateLdapSettings,
};

export default connect(null, mapDispatchToProps)(SettingsLdapForm);
