/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import { connect } from "react-redux";
import { updateLdapSettings } from "metabase/admin/settings/settings";

import SettingsBatchForm from "./SettingsBatchForm";

@connect(
  null,
  { updateSettings: updateLdapSettings },
)
export default class SettingsLdapForm extends React.Component {
  render() {
    return (
      <SettingsBatchForm
        {...this.props}
        breadcrumbs={[
          [t`Authentication`, "/admin/settings/authentication"],
          [t`LDAP`],
        ]}
        enabledKey="ldap-enabled"
        layout={[
          {
            title: t`Server Settings`,
            settings: [
              "ldap-enabled",
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
              "ldap-group-membership-filter" in this.props.settingValues
                ? "ldap-group-membership-filter"
                : null,
              "ldap-sync-admin-group" in this.props.settingValues
                ? "ldap-sync-admin-group"
                : null,
            ].filter(Boolean),
          },
        ]}
      />
    );
  }
}
