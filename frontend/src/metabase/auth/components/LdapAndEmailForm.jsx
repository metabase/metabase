import React, { Component } from "react";
import { Link } from "react-router";
import { connect } from "react-redux";
import { t } from "ttag";

import Settings from "metabase/lib/settings";
import Utils from "metabase/lib/utils";
import validate from "metabase/lib/validate";
import Form from "metabase/containers/Form";

import { login } from "../auth";

const mapDispatchToProps = { login };

@connect(
  null,
  mapDispatchToProps,
)
export default class LdapAndEmailForm extends Component {
  onSubmit = async credentials => {
    const { login, location } = this.props;
    await login(credentials, location.query.redirect);
  };

  render() {
    const ldapEnabled = Settings.ldapEnabled();
    return (
      <Form onSubmit={this.onSubmit}>
        {({ values, Form, FormField, FormSubmit, FormMessage }) => (
          <Form>
            <FormField
              name="username"
              type={ldapEnabled ? "input" : "email"}
              title={
                ldapEnabled ? t`Username or email address` : t`Email address`
              }
              placeholder={t`youlooknicetoday@email.com`}
              validate={ldapEnabled ? validate.required() : validate.email()}
            />
            <FormField
              name="password"
              type="password"
              title={t`Password`}
              placeholder={t`Shhh...`}
              validate={validate.required()}
            />
            <FormField
              name="remember"
              type="checkbox"
              title={t`Remember me`}
              initial={true}
              horizontal
            />
            <FormMessage />
            <div className="Form-actions text-centered">
              <FormSubmit className="block full mb2">{t`Sign in`}</FormSubmit>
              <ForgotPasswordLink credentials={values} />
            </div>
          </Form>
        )}
      </Form>
    );
  }
}

const ForgotPasswordLink = ({ credentials = {} }) => (
  <Link
    to={
      "/auth/forgot_password" +
      (Utils.validEmail(credentials.username)
        ? "?email=" + encodeURIComponent(credentials.username)
        : "")
    }
    className="text-light text-brand-hover"
    onClick={e => {
      window.OSX ? window.OSX.resetPassword() : null;
    }}
  >
    {t`I seem to have forgotten my password`}
  </Link>
);
