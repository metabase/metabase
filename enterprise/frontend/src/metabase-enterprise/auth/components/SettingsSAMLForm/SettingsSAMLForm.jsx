import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import _ from "underscore";
import Breadcrumbs from "metabase/components/Breadcrumbs";
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

  const FAKE_ACS_URL_KEY = "FAKE_ACS_URL_KEY";

  const handleSubmit = useCallback(
    values => {
      const { [FAKE_ACS_URL_KEY]: _, ...realValues } = values;
      return onSubmit({ ...realValues, "saml-enabled": true });
    },
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={{
        ...attributeValues,
        [FAKE_ACS_URL_KEY]: getAcsCustomerUrl(),
      }}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      {({ dirty }) => (
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
              <ExternalLink
                href={getDocsUrl()}
              >{t`documentation`}</ExternalLink>
            )}.`}
          </SAMLFormCaption>
          <SAMLFormSection>
            <h3 className="mb0">{t`Configure your identity provider (IdP)`}</h3>
            <p className="mb4 mt1 text-medium">{t`Your identity provider will need the following info about Metabase.`}</p>

            <FormTextInput
              name={FAKE_ACS_URL_KEY}
              description={t`This is called the Single Sign On URL in Okta, the Application Callback URL in Auth0, and the ACS (Consumer) URL in OneLogin. `}
              hasCopyButton
              readOnly
              label={t`URL the IdP should redirect back to`}
            />

            <h4 className="pt2">{t`SAML attributes`}</h4>
            <p className="mb3 mt1 text-medium">{t`In most IdPs, you'll need to put each of these in an input box labeled
                        "Name" in the attribute statements section.`}</p>

            <Stack gap="md">
              <FormTextInput
                {...fields["saml-attribute-email"]}
                hasCopyButton
                label={t`User's email attribute`}
              />
              <FormTextInput
                {...fields["saml-attribute-firstname"]}
                hasCopyButton
                label={t`User's first name attribute`}
              />
              <FormTextInput
                {...fields["saml-attribute-lastname"]}
                hasCopyButton
                label={t`User's last name attribute`}
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
            <Stack gap="md">
              <GroupMappingsWidget
                isFormik
                // map to legacy setting props
                setting={{ key: "saml-group-sync" }}
                onChange={handleSubmit}
                settingValues={settingValues}
                mappingSetting="saml-group-mappings"
                groupHeading={t`Group Name`}
                groupPlaceholder={t`Group Name`}
              />
              <FormTextInput
                {...fields["saml-attribute-group"]}
                label={t`Group attribute name`}
              />
            </Stack>
          </SAMLFormSection>

          <SAMLFormFooter>
            <FormErrorMessage />
            <FormSubmitButton
              disabled={!dirty}
              label={isEnabled ? t`Save changes` : t`Save and enable`}
              variant="filled"
            />
          </SAMLFormFooter>
        </Form>
      )}
    </FormProvider>
  );
};

// NOTE: This serves two purposes.
// 1) Our `settingValues` has settings unrelated to SAML, which was previously sifted by collecting only those matching inline field names in our form.
// 2) Some values should be replaced by defaults.
const IS_SAML_ATTR_DEFAULTABLE = {
  "saml-attribute-email": true,
  "saml-attribute-firstname": true,
  "saml-attribute-lastname": true,
  "saml-identity-provider-uri": true,
  "saml-identity-provider-issuer": true,
  "saml-identity-provider-certificate": true,
  "saml-application-name": true,
  "saml-keystore-password": false,
  "saml-keystore-alias": false,
  "saml-keystore-path": false,
  "saml-attribute-group": false,
  "saml-group-sync": false,
};

const getAttributeValues = (values, defaults) => {
  return Object.fromEntries(
    Object.entries(IS_SAML_ATTR_DEFAULTABLE).map(([key, isDefaultable]) => [
      key,
      isDefaultable ? values[key] ?? defaults[key] : values[key],
    ]),
  );
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
