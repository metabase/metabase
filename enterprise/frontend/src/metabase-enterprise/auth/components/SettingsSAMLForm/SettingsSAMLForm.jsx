import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import { updateSettings } from "metabase/admin/settings/settings";
import { settingToFormField } from "metabase/admin/settings/utils";
import Form, {
  FormField,
  FormSubmit,
  FormMessage,
  FormSection,
} from "metabase/containers/FormikForm";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import CopyWidget from "metabase/components/CopyWidget";
import GroupMappingsWidget from "metabase/admin/settings/components/widgets/GroupMappingsWidget";
import MetabaseSettings from "metabase/lib/settings";
import { SAMLFormSection } from "./SettingsSAMLForm.styled";

const propTypes = {
  elements: PropTypes.array,
  settingValues: PropTypes.object,
  onSubmit: PropTypes.func,
};

const SAML_ATTRIBUTES = [
  "saml-attribute-email",
  "saml-attribute-firstname",
  "saml-attribute-lastname",
];

const SettingsSAMLForm = ({ elements = [], settingValues = {}, onSubmit }) => {
  const settings = _.indexBy(elements, "key");
  const fields = _.mapObject(settings, settingToFormField);
  const defaultValues = _.mapObject(settings, "default");
  const acsCustomerUrl = `${MetabaseSettings.get("site-url")}/auth/sso`;
  const attributeValues = _.object(
    SAML_ATTRIBUTES.map(key => [key, settingValues[key] ?? defaultValues[key]]),
  );

  return (
    <Form
      className="mx2"
      style={{ maxWidth: 520 }}
      initialValues={{ ...settingValues, ...attributeValues }}
      overwriteOnInitialValuesChange
      onSubmit={onSubmit}
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
        {...fields["saml-enabled"]}
        name="saml-enabled"
        title={t`SAML Authentication`}
        type="boolean"
        showEnabledLabel={false}
      />
      <SAMLFormSection>
        <h3 className="mb0">{t`Configure your identity provider (IdP)`}</h3>
        <p className="mb4 mt1 text-medium">{t`Your identity provider will need the following info about Metabase.`}</p>

        <div className="Form-field">
          <div className="Form-label">{t`URL the IdP should redirect back to`}</div>
          <div className="pb1">{t`This is called the Single Sign On URL in Okta, the Application Callback URL in Auth0,
                                  and the ACS (Consumer) URL in OneLogin. `}</div>
          <CopyWidget value={acsCustomerUrl} />
        </div>

        <h4 className="pt2">{t`SAML attributes`}</h4>
        <p className="mb3 mt1 text-medium">{t`In most IdPs, you'll need to put each of these in an input box labeled
                        "Name" in the attribute statements section.`}</p>

        <FormField
          {...fields["saml-attribute-email"]}
          title={t`User's email attribute`}
          type={({ field }) => <CopyWidget {...field} />}
        />
        <FormField
          {...fields["saml-attribute-firstname"]}
          title={t`User's first name attribute`}
          type={({ field }) => <CopyWidget {...field} />}
        />
        <FormField
          {...fields["saml-attribute-lastname"]}
          title={t`User's last name attribute`}
          type={({ field }) => <CopyWidget {...field} />}
        />
      </SAMLFormSection>

      <SAMLFormSection>
        <h3 className="mb0">{t`Tell Metabase about your identity provider`}</h3>
        <p className="mb4 mt1 text-medium">{t`Metabase will need the following info about your provider.`}</p>
        <FormField
          {...fields["saml-identity-provider-uri"]}
          title={t`SAML Identity Provider URL`}
          placeholder="https://your-org-name.yourIDP.com"
          required
          autoFocus
        />
        <FormField
          {...fields["saml-identity-provider-certificate"]}
          title={t`SAML Identity Provider Certificate`}
          type="text"
          required
          monospaceText
        />
        <FormField
          {...fields["saml-application-name"]}
          title={t`SAML Application Name`}
        />
        <FormField
          {...fields["saml-identity-provider-issuer"]}
          title={t`SAML Identity Provider Issuer`}
        />
      </SAMLFormSection>

      <SAMLFormSection isSSLSection={true}>
        <FormSection title={t`Sign SSO requests (optional)`} collapsible>
          <FormField
            {...fields["saml-keystore-path"]}
            title={t`SAML Keystore Path`}
          />
          <FormField
            {...fields["saml-keystore-password"]}
            title={t`SAML Keystore Password`}
            type="password"
            placeholder={t`Shh...`}
          />
          <FormField
            {...fields["saml-keystore-alias"]}
            title={t`SAML Keystore Alias`}
          />
        </FormSection>
      </SAMLFormSection>

      <SAMLFormSection>
        <h3 className="mb0">{t`Synchronize group membership with your SSO`}</h3>
        <p className="mb4 mt1 text-medium">
          {t`To enable this, you'll need to create mappings to tell Metabase which group(s) your users should
               be added to based on the SSO group they're in.`}
        </p>
        <FormField
          {...fields["saml-group-sync"]}
          title={t`Synchronize group memberships`}
          type={({ field: { value, onChange } }) => (
            <GroupMappingsWidget
              // map to legacy setting props
              setting={{ key: "saml-group-sync", value }}
              onChange={onChange}
              settingValues={settingValues}
              onChangeSetting={(key, value) => updateSettings({ [key]: value })}
              mappingSetting="saml-group-mappings"
              groupHeading={t`Group Name`}
              groupPlaceholder={t`Group Name`}
            />
          )}
        />
        <FormField
          {...fields["saml-attribute-group"]}
          title={t`Group attribute name`}
        />
      </SAMLFormSection>

      <div>
        <FormMessage />
      </div>
      <div>
        <FormSubmit>{t`Save changes`}</FormSubmit>
      </div>
    </Form>
  );
};

SettingsSAMLForm.propTypes = propTypes;

export default SettingsSAMLForm;
