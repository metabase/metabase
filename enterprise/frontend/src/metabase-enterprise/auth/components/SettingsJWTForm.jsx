import React, { Component } from "react";
import { t } from "ttag";

import SettingsBatchForm from "metabase/admin/settings/components/SettingsBatchForm";

export default class SettingsJWTForm extends Component {
  render() {
    return (
      <SettingsBatchForm
        {...this.props}
        breadcrumbs={[
          [t`Authentication`, "/admin/settings/authentication"],
          [t`JWT`],
        ]}
        enabledKey="jwt-enabled"
        layout={[
          {
            title: t`Server Settings`,
            settings: [
              "jwt-enabled",
              "jwt-identity-provider-uri",
              "jwt-shared-secret",
            ],
          },
          {
            title: t`User attribute configuration (optional)`,
            collapse: true,
            settings: [
              "jwt-attribute-email",
              "jwt-attribute-firstname",
              "jwt-attribute-lastname",
            ],
          },
          {
            title: t`Group Schema`,
            settings: ["jwt-group-sync"],
          },
        ]}
      />
    );
  }
}
