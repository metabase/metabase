/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import { Box } from "grid-styled";

import { updateSettings } from "metabase/admin/settings/settings";
import { settingToFormField } from "metabase/admin/settings/utils";

import Form, {
  FormField,
  FormSubmit,
  FormMessage,
  FormSection,
} from "metabase/containers/Form";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import CopyWidget from "metabase/components/CopyWidget";

import GroupMappingsWidget from "metabase/admin/settings/components/widgets/GroupMappingsWidget";

import MetabaseSettings from "metabase/lib/settings";

@connect(
  null,
  { updateSettings },
)
export default class SettingsSAMLForm extends Component {
  render() {
    const { elements, settingValues, updateSettings } = this.props;
    // TODO: move these to an outer component so we don't have to do it in every form page
    const setting = name =>
      _.findWhere(elements, { key: name }) || { key: name };
    const settingField = name => settingToFormField(setting(name));

    const initialValues = { ...settingValues };

    // HACK: this is to make the default show up as selectable text instead of placeholder
    const addDefaultAsInitialValue = name => {
      if (initialValues[name] == null && setting(name).default != null) {
        initialValues[name] = setting(name).default;
      }
    };
    addDefaultAsInitialValue("saml-attribute-email");
    addDefaultAsInitialValue("saml-attribute-firstname");
    addDefaultAsInitialValue("saml-attribute-lastname");

    const acsConsumerUrl = MetabaseSettings.get("site-url") + "/auth/sso";

    return (
      <Form
        className="mx2"
        style={{ maxWidth: 520 }}
        initialValues={initialValues}
        onSubmit={updateSettings}
      >
        <Breadcrumbs
          className="mb3"
          crumbs={[
            [t`Authentication`, "/admin/settings/authentication"],
            [t`SAML`],
          ]}
        />
        <h2 className="mb3">{t`Set up SAML-based SSO`}</h2>
        <FormField
          {...settingField("saml-enabled")}
          name="saml-enabled"
          title={t`SAML Authentication`}
          type="boolean"
          showEnabledLabel={false}
        />
        <Box className="bordered rounded" px={3} pt={3} pb={2} mb={2}>
          <h3 className="mb0">{t`Configure your identity provider (IdP)`}</h3>
          <p className="mb4 mt1 text-medium">{t`Your identity provider will need the following info about Metabase.`}</p>

          <div className="Form-field" s>
            <div className="Form-label">{t`URL the IdP should redirect back to`}</div>
            <div className="pb1">{t`This is called the Single Sign On URL in Okta, the Application Callback URL in Auth0,
                                  and the ACS (Consumer) URL in OneLogin. `}</div>
            <CopyWidget value={acsConsumerUrl} />
          </div>

          <h4 className="pt2">{t`SAML attributes`}</h4>
          <p className="mb3 mt1 text-medium">{t`In most IdPs, you'll need to put each of these in an input box labeled
                        "Name" in the attribute statements section.`}</p>

          <FormField
            {...settingField("saml-attribute-email")}
            title={t`User's email attribute`}
            type={({ field }) => <CopyWidget {...field} />}
          />
          <FormField
            {...settingField("saml-attribute-firstname")}
            title={t`User's first name attribute`}
            type={({ field }) => <CopyWidget {...field} />}
          />
          <FormField
            {...settingField("saml-attribute-lastname")}
            title={t`User's last name attribute`}
            type={({ field }) => <CopyWidget {...field} />}
          />
        </Box>

        <Box className="bordered rounded" px={3} pt={3} pb={2} mb={2}>
          <h3 className="mb0">{t`Tell Metabase about your identity provider`}</h3>
          <p className="mb4 mt1 text-medium">{t`Metabase will need the following info about your provider.`}</p>
          <FormField
            {...settingField("saml-identity-provider-uri")}
            title={t`SAML Identity Provider URL`}
            placeholder="https://your-org-name.yourIDP.com"
            required
            autoFocus
          />
          <FormField
            {...settingField("saml-identity-provider-certificate")}
            title={t`SAML Identity Provider Certificate`}
            type="text"
            required
            monospaceText
          />
          <FormField
            {...settingField("saml-application-name")}
            title={t`SAML Application Name`}
          />
          <FormField
            {...settingField("saml-identity-provider-issuer")}
            title={t`SAML Identity Provider Issuer`}
          />
        </Box>

        <Box className="bordered rounded" px={3} pt={3} pb={1} mb={2}>
          <FormSection title={t`Sign SSO requests (optional)`} collapsible>
            <FormField
              {...settingField("saml-keystore-path")}
              title={t`SAML Keystore Path`}
            />
            <FormField
              {...settingField("saml-keystore-password")}
              title={t`SAML Keystore Password`}
              type="password"
              placeholder={t`Shh...`}
            />
            <FormField
              {...settingField("saml-keystore-alias")}
              title={t`SAML Keystore Alias`}
            />
          </FormSection>
        </Box>

        <Box className="bordered rounded" px={3} pt={3} pb={2} mb={2}>
          <h3 className="mb0">{t`Synchronize group membership with your SSO`}</h3>
          <p className="mb4 mt1 text-medium">
            {t`To enable this, you'll need to create mappings to tell Metabase which group(s) your users should
               be added to based on the SSO group they're in.`}
          </p>
          <FormField
            {...settingField("saml-group-sync")}
            title={t`Synchronize group memberships`}
            type={({ field: { value, onChange } }) => (
              <GroupMappingsWidget
                // map to legacy setting props
                setting={{ key: "saml-group-sync", value }}
                onChange={onChange}
                settingValues={settingValues}
                onChangeSetting={(key, value) =>
                  updateSettings({ [key]: value })
                }
                mappingSetting="saml-group-mappings"
                groupHeading={t`Group Name`}
                groupPlaceholder={t`Group Name`}
              />
            )}
          />
          <FormField
            {...settingField("saml-attribute-group")}
            title={t`Group attribute name`}
          />
        </Box>

        <div>
          <FormMessage />
        </div>
        <div>
          <FormSubmit>{t`Save changes`}</FormSubmit>
        </div>
      </Form>
    );
  }
}
