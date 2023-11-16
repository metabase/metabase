import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import _ from "underscore";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import CopyWidget from "metabase/components/CopyWidget";
import ExternalLink from "metabase/core/components/ExternalLink";
import { FormSection } from "metabase/containers/FormikForm";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextarea,
  FormTextInput,
} from "metabase/forms";
import { Stack } from "metabase/ui";
import MetabaseSettings from "metabase/lib/settings";
import GroupMappingsWidget from "metabase/admin/settings/containers/GroupMappingsWidget";

import { updateSamlSettings } from "metabase/admin/settings/settings";
import { settingToFormField } from "metabase/admin/settings/utils";
import {
  SAMLFormCaption,
  SAMLFormFooter,
  SAMLFormSection,
} from "./SettingsSAMLForm.styled";

const propTypes = {
  elements: PropTypes.array,
  settingValues: PropTypes.object,
  onSubmit: PropTypes.func,
};

const SettingsSAMLForm = ({ elements = [], settingValues = {}, onSubmit }) => {
  const isEnabled = Boolean(settingValues["saml-enabled"]);

  const settings = useMemo(() => {
    return _.indexBy(elements, "key");
  }, [elements]);

  const fields = useMemo(() => {
    return _.mapObject(settings, settingToFormField);
  }, [settings]);

  const defaultValues = useMemo(() => {
    return _.mapObject(settings, "default");
  }, [settings]);

  const attributeValues = useMemo(() => {
    return getAttributeValues(settingValues, defaultValues);
  }, [settingValues, defaultValues]);

  const handleSubmit = useCallback(
    values => onSubmit({ ...values, "saml-enabled": true }),
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={attributeValues}
      onSubmit={handleSubmit}
      enableReinitialize
      // disablePristineSubmit
    >
      <Form className="mx2">
        <Breadcrumbs
          className="mb3"
          crumbs={[
            [t`Authentication`, "/admin/settings/authentication"],
            [t`SAML`],
          ]}
        />
        <h2 className="mb3">{t`Set up SAML-based SSO`}</h2>
        <SAMLFormCaption>
          {jt`Use the settings below to configure your SSO via SAML. If you have any questions, check out our ${(
            <ExternalLink href={getDocsUrl()}>{t`documentation`}</ExternalLink>
          )}.`}
        </SAMLFormCaption>
        <SAMLFormSection>
          <h3 className="mb0">{t`Configure your identity provider (IdP)`}</h3>
          <p className="mb4 mt1 text-medium">{t`Your identity provider will need the following info about Metabase.`}</p>

          <div className="Form-field">
            <div className="Form-label">{t`URL the IdP should redirect back to`}</div>
            <div className="pb1">{t`This is called the Single Sign On URL in Okta, the Application Callback URL in Auth0,
                                  and the ACS (Consumer) URL in OneLogin. `}</div>
            <CopyWidget value={getAcsCustomerUrl()} />
          </div>

          <h4 className="pt2">{t`SAML attributes`}</h4>
          <p className="mb3 mt1 text-medium">{t`In most IdPs, you'll need to put each of these in an input box labeled
                        "Name" in the attribute statements section.`}</p>

          <Stack gap="md">
            <FormTextInput
              label={t`User's email attribute`}
              {...fields["saml-attribute-email"]}
              // TODO: make <CopyWidget {...field} />
            />
            <FormTextInput
              {...fields["saml-attribute-firstname"]}
              label={t`User's first name attribute`}
              // TODO: make <CopyWidget {...field} />
            />
            <FormTextInput
              {...fields["saml-attribute-lastname"]}
              label={t`User's last name attribute`}
              // TODO: make <CopyWidget {...field} />
            />
          </Stack>
        </SAMLFormSection>

        <SAMLFormSection>
          <h3 className="mb0">{t`Tell Metabase about your identity provider`}</h3>
          <p className="mb4 mt1 text-medium">{t`Metabase will need the following info about your provider.`}</p>
          <Stack gap="md">
            <FormTextInput
              {...fields["saml-identity-provider-uri"]}
              label={t`SAML Identity Provider URL`}
              placeholder="https://your-org-name.yourIDP.com"
              required
              autoFocus
            />
            <FormTextarea
              {...fields["saml-identity-provider-certificate"]}
              label={t`SAML Identity Provider Certificate`}
              required
              monospaceText
            />
            <FormTextInput
              {...fields["saml-application-name"]}
              label={t`SAML Application Name`}
            />
            <FormTextInput
              {...fields["saml-identity-provider-issuer"]}
              label={t`SAML Identity Provider Issuer`}
            />
          </Stack>
        </SAMLFormSection>

        <SAMLFormSection isSSLSection={true}>
          <FormSection title={t`Sign SSO requests (optional)`} collapsible>
            <Stack gap="md">
              <FormTextInput
                {...fields["saml-keystore-path"]}
                label={t`SAML Keystore Path`}
              />
              <FormTextInput
                {...fields["saml-keystore-password"]}
                label={t`SAML Keystore Password`}
                type="password"
                placeholder={t`Shh...`}
              />
              <FormTextInput
                {...fields["saml-keystore-alias"]}
                label={t`SAML Keystore Alias`}
              />
            </Stack>
          </FormSection>
        </SAMLFormSection>

        <SAMLFormSection wide>
          <h3 className="mb0">{t`Synchronize group membership with your SSO`}</h3>
          <p className="mb4 mt1 text-medium">
            {t`To enable this, you'll need to create mappings to tell Metabase which group(s) your users should
               be added to based on the SSO group they're in.`}
          </p>
          {/*{...fields["saml-group-sync"]}*/}
          {/*type={({ field: { value, onChange } }) => (*/}
          <Stack gap="md">
            <GroupMappingsWidget
              // map to legacy setting props
              setting={{
                key: "saml-group-sync",
                value: fields["saml-group-sync"],
              }}
              onChange={handleSubmit}
              settingValues={settingValues}
              mappingSetting="saml-group-mappings"
              groupHeading={t`Group Name`}
              groupPlaceholder={t`Group Name`}
            />
            {/*)}*/}
            <FormTextInput
              {...fields["saml-attribute-group"]}
              label={t`Group attribute name`}
            />
          </Stack>
        </SAMLFormSection>

        <div>
          <FormErrorMessage />
        </div>
        <SAMLFormFooter>
          <FormSubmitButton
            label={isEnabled ? t`Save changes` : t`Save and enable`}
            variant="filled"
          ></FormSubmitButton>
        </SAMLFormFooter>
      </Form>
    </FormProvider>
  );
};

const SAML_ATTRS = [
  "saml-attribute-email",
  "saml-attribute-firstname",
  "saml-attribute-lastname",
  "saml-identity-provider-uri",
  "saml-identity-provider-issuer",
  "saml-identity-provider-certificate",
  "saml-application-name",
  "saml-keystore-password",
  "saml-attribute-group",
  "saml-group-sync",
  "saml-keystore-alias",
  "saml-keystore-path",
  "saml-enabled",
];

const getAttributeValues = (values, defaults) => {
  return _.object(SAML_ATTRS.map(key => [key, values[key] ?? defaults[key]]));
};

const getAcsCustomerUrl = () => {
  return `${MetabaseSettings.get("site-url")}/auth/sso`;
};

const getDocsUrl = () => {
  return MetabaseSettings.docsUrl("people-and-groups/authenticating-with-saml");
};

SettingsSAMLForm.propTypes = propTypes;

const mapDispatchToProps = {
  onSubmit: updateSamlSettings,
};

export default connect(null, mapDispatchToProps)(SettingsSAMLForm);
