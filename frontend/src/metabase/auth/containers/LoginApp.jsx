import React, { Component } from "react";
import { findDOMNode } from "react-dom";
import { Link } from "react-router";
import { connect } from "react-redux";

import { t } from "ttag";
import AuthScene from "../components/AuthScene";
import SSOLoginButton from "../components/SSOLoginButton";
import Button from "metabase/components/Button";
import FormMessage from "metabase/components/form/FormMessage";
import LogoIcon from "metabase/components/LogoIcon";
import Settings from "metabase/lib/settings";
import Utils from "metabase/lib/utils";
import validate from "metabase/lib/validate";

import Form from "metabase/containers/Form";

import * as authActions from "../auth";

const mapStateToProps = (state, props) => {
  return {
    loginError: state.auth && state.auth.loginError,
    user: state.currentUser,
  };
};

const mapDispatchToProps = {
  ...authActions,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class LoginApp extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      rememberMe: true,
    };
  }

  componentDidMount() {
    const { loginGoogle, location } = this.props;

    const ssoLoginButton = findDOMNode(this.refs.ssoLoginButton);

    function attachGoogleAuth() {
      // if gapi isn't loaded yet then wait 100ms and check again. Keep doing this until we're ready
      if (!window.gapi) {
        window.setTimeout(attachGoogleAuth, 100);
        return;
      }
      try {
        window.gapi.load("auth2", () => {
          const auth2 = window.gapi.auth2.init({
            client_id: Settings.get("google_auth_client_id"),
            cookiepolicy: "single_host_origin",
          });
          auth2.attachClickHandler(
            ssoLoginButton,
            {},
            googleUser => loginGoogle(googleUser, location.query.redirect),
            error => console.error("There was an error logging in", error),
          );
        });
      } catch (error) {
        console.error("Error attaching Google Auth handler: ", error);
      }
    }
    attachGoogleAuth();
  }

  handleUsernameAndPasswordLogin = async credentials => {
    const { login, location } = this.props;
    await login(credentials, location.query.redirect);
  };

  render() {
    const { loginError, location } = this.props;
    const ldapEnabled = Settings.ldapEnabled();

    const preferUsernameAndPassword = location.query.useMBLogin;

    return (
      <div className="bg-white flex flex-column flex-full md-layout-centered">
        <div className="Login-wrapper wrapper Grid Grid--full md-Grid--1of2 relative z2">
          <div className="Grid-cell flex layout-centered text-brand">
            <LogoIcon className="Logo my4 sm-my0" width={66} height={85} />
          </div>
          <div className="Login-content Grid-cell">
            <div className="p4 bg-white bordered rounded shadowed">
              <h2 className="Login-header mb2">{t`Sign in to Metabase`}</h2>

              {Settings.ssoEnabled() && !preferUsernameAndPassword && (
                <div className="py3 relative my4">
                  <div className="relative border-bottom pb4">
                    <SSOLoginButton provider="google" ref="ssoLoginButton" />
                    <div
                      className="mx1 absolute text-centered left right"
                      style={{ bottom: -8 }}
                    >
                      <span className="text-bold px3 py2 text-medium bg-white">{t`OR`}</span>
                    </div>
                  </div>
                  <div className="py3">
                    <Link to="/auth/login?useMBLogin=true">
                      <Button className="EmailSignIn full py2">
                        {t`Sign in with email`}
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {(!Settings.ssoEnabled() || preferUsernameAndPassword) && (
                <UsernameAndPasswordForm
                  onSubmit={this.handleUsernameAndPasswordLogin}
                  ldapEnabled={ldapEnabled}
                />
              )}

              <FormMessage
                formError={
                  loginError && loginError.data.message ? loginError : null
                }
              />
            </div>
          </div>
        </div>
        <AuthScene />
      </div>
    );
  }
}

const UsernameAndPasswordForm = ({ onSubmit, ldapEnabled }) => (
  <Form onSubmit={onSubmit}>
    {({ values, Form, FormField, FormSubmit, FormMessage }) => (
      <Form>
        <FormField
          name="username"
          type={ldapEnabled ? "input" : "email"}
          title={ldapEnabled ? t`Username or email address` : t`Email address`}
          placeholder="youlooknicetoday@email.com"
          validate={ldapEnabled ? validate.required() : validate.email()}
        />
        <FormField
          name="password"
          type="password"
          title={t`Password`}
          placeholder="Shh..."
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
        <div className="Form-actions flex align-center">
          <FormSubmit>{t`Sign in`}</FormSubmit>
          <ForgotPasswordLink credentials={values} />
        </div>
      </Form>
    )}
  </Form>
);

const ForgotPasswordLink = ({ credentials = {} }) => (
  <Link
    to={
      "/auth/forgot_password" +
      (Utils.validEmail(credentials.username)
        ? "?email=" + encodeURIComponent(credentials.username)
        : "")
    }
    className="text-right ml-auto link"
    onClick={e => {
      window.OSX ? window.OSX.resetPassword() : null;
    }}
  >
    {t`I seem to have forgotten my password`}
  </Link>
);
