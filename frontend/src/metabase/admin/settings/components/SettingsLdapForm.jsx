import React, { Component } from "react";
import { t } from "c-3po";

import SettingsBatchForm from "./SettingsBatchForm";

export default class SettingsLdapForm extends Component {
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
            settings: ["ldap-group-sync", "ldap-group-base"],
          },
        ]}
        updateSettings={this.props.updateLdapSettings}
      />
    );
  }
}
