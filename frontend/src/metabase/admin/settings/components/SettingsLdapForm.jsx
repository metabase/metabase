import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import { updateLdapSettings } from "metabase/admin/settings/settings";
import SettingsBatchForm from "./SettingsBatchForm";

const propTypes = {
  settingValues: PropTypes.object.isRequired,
  updateLdapSettings: PropTypes.func.isRequired,
};

const SettingsLdapForm = ({ settingValues, updateLdapSettings, ...props }) => {
  const breadcrumbs = useMemo(() => getBreadcrumbs(), []);
  const layout = useMemo(() => getLayout(settingValues), [settingValues]);

  return (
    <SettingsBatchForm
      {...props}
      breadcrumbs={breadcrumbs}
      layout={layout}
      updateSettings={updateLdapSettings}
    />
  );
};

SettingsLdapForm.propTypes = propTypes;

const getBreadcrumbs = () => {
  return [[t`Authentication`, "/admin/settings/authentication"], [t`LDAP`]];
};

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

const mapDispatchToProps = { updateLdapSettings };

export default connect(null, mapDispatchToProps)(SettingsLdapForm);
