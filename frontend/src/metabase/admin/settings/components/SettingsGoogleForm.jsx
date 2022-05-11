import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import Form, {
  FormField,
  FormSubmit,
  FormMessage,
} from "metabase/containers/Form";

import { updateSettings } from "metabase/admin/settings/settings";
import { settingToFormField } from "metabase/admin/settings/utils";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";

const settingsGoogleFormPropTypes = {
  elements: PropTypes.array,
  settingValues: PropTypes.object,
  updateSettings: PropTypes.func,
};

class SettingsGoogleForm extends Component {
  render() {
    const { elements, settingValues, updateSettings } = this.props;

    const setting = name =>
      _.findWhere(elements, { key: name }) || { key: name };
    const settingField = name => settingToFormField(setting(name));

    const initialValues = { ...settingValues };

    return (
      <Form
        className="mx2"
        style={{ maxWidth: 520 }}
        initialValues={initialValues}
        onSubmit={updateSettings}
      >
        <Breadcrumbs
          crumbs={[
            [t`Authentication`, "/admin/settings/authentication"],
            [t`Google Sign-In`],
          ]}
          className="mb2"
        />
        <h2>{t`Sign in with Google`}</h2>
        <p className="text-medium">
          {t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`}
        </p>
        <p className="text-medium">
          {jt`To allow users to sign in with Google you'll need to give Metabase a Google Developers console application client ID. It only takes a few steps and instructions on how to create a key can be found ${(
            <ExternalLink
              href={MetabaseSettings.docsUrl(
                "administration-guide/10-single-sign-on",
                "enabling-google-sign-in",
              )}
              target="_blank"
            >
              {t`here`}
            </ExternalLink>
          )}.`}
        </p>
        <FormField
          {...settingField("google-auth-client-id")}
          title={t`Client ID`}
          description=""
          placeholder={t`{your-client-id}.apps.googleusercontent.com`}
          required
          autoFocus
        />
        <FormField
          {...settingField("google-auth-auto-create-accounts-domain")}
          title={t`Domain`}
        />
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

export default connect(null, { updateSettings })(SettingsGoogleForm);

SettingsGoogleForm.propTypes = settingsGoogleFormPropTypes;
