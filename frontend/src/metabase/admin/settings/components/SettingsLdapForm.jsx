import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import { updateLdapSettings } from "metabase/admin/settings/settings";
import SettingsBatchForm from "./SettingsBatchForm";
import { FormButton } from "./SettingsLdapForm.styled";

const propTypes = {
  settingValues: PropTypes.object.isRequired,
  updateLdapSettings: PropTypes.func.isRequired,
};

const SettingsLdapForm = ({ settingValues, updateLdapSettings, ...props }) => {
  const isEnabled = settingValues["ldap-enabled"];
  const layout = getLayout(settingValues);
  const breadcrumbs = getBreadcrumbs();

  const handleSubmit = values => {
    return updateLdapSettings({ ...values, "ldap-enabled": true });
  };

  return (
    <SettingsBatchForm
      {...props}
      layout={layout}
      breadcrumbs={breadcrumbs}
      settingValues={settingValues}
      updateSettings={handleSubmit}
      renderSubmitButton={({ disabled, pristine, onSubmit }) => (
        <FormButton
          primary={!disabled}
          disabled={disabled || pristine}
          actionFn={onSubmit}
          normalText={isEnabled ? t`Save changes` : t`Save and enable`}
          successText={t`Changes saved!`}
        />
      )}
    />
  );
};

SettingsLdapForm.propTypes = propTypes;

const getLayout = settingValues => {
  return [
    {
      title: t`Server Settings`,
      settings: [
        "ldap-host",
        "ldap-port",
        "ldap-security",
        "ldap-bind-dn",
        "ldap-password",
      ],
    },
    {
      title: t`User Schema`,
      settings: ["ldap-user-base", "ldap-user-filter"],
    },
    {
      title: t`Attributes`,
      collapse: true,
      settings: [
        "ldap-attribute-email",
        "ldap-attribute-firstname",
        "ldap-attribute-lastname",
      ],
    },
    {
      title: t`Group Schema`,
      settings: [
        "ldap-group-sync",
        "ldap-group-base",
        "ldap-group-membership-filter" in settingValues
          ? "ldap-group-membership-filter"
          : null,
        "ldap-sync-admin-group" in settingValues
          ? "ldap-sync-admin-group"
          : null,
      ].filter(Boolean),
    },
  ];
};

const getBreadcrumbs = () => {
  return [[t`Authentication`, "/admin/settings/authentication"], [t`LDAP`]];
};

const mapDispatchToProps = { updateLdapSettings };

export default connect(null, mapDispatchToProps)(SettingsLdapForm);
