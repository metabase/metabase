import React, { Component } from "react";
import { findDOMNode } from "react-dom";
import { Link } from "react-router";
import { connect } from "react-redux";

import cx from "classnames";
import { t } from "c-3po";
import AuthScene from "../components/AuthScene.jsx";
import SSOLoginButton from "../components/SSOLoginButton.jsx";
import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";
import FormMessage from "metabase/components/form/FormMessage.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";
import Settings from "metabase/lib/settings";
import Utils from "metabase/lib/utils";

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

@connect(mapStateToProps, mapDispatchToProps)
export default class LoginApp extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      credentials: {},
      valid: false,
    };
  }

  validateForm() {
    let { credentials } = this.state;

    let valid = true;

    if (!credentials.username || !credentials.password) {
      valid = false;
    }

    if (this.state.valid !== valid) {
      this.setState({ valid });
    }
  }

  componentDidMount() {
    this.validateForm();

    const { loginGoogle, location } = this.props;

    let ssoLoginButton = findDOMNode(this.refs.ssoLoginButton);

    function attachGoogleAuth() {
      // if gapi isn't loaded yet then wait 100ms and check again. Keep doing this until we're ready
      if (!window.gapi) {
        window.setTimeout(attachGoogleAuth, 100);
        return;
      }
      try {
        window.gapi.load("auth2", () => {
          let auth2 = window.gapi.auth2.init({
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

  componentDidUpdate() {
    this.validateForm();
  }

  onChangeUserName(fieldName, fieldValue) {
    this.onChange(fieldName, fieldValue.trim());
  }

  onChange(fieldName, fieldValue) {
    this.setState({
      credentials: { ...this.state.credentials, [fieldName]: fieldValue },
    });
  }

  formSubmitted(e) {
    e.preventDefault();

    let { login, location } = this.props;
    let { credentials } = this.state;

    login(credentials, location.query.redirect);
  }

  render() {
    const { loginError } = this.props;
    const ldapEnabled = Settings.ldapEnabled();

    return (
      <div className="full bg-white flex flex-column flex-full md-layout-centered">
        <div className="Login-wrapper wrapper Grid Grid--full md-Grid--1of2 relative z2">
          <div className="Grid-cell flex layout-centered text-brand">
            <LogoIcon className="Logo my4 sm-my0" width={66} height={85} />
          </div>
          <div className="Login-content Grid-cell">
            <form
              className="Form-new bg-white bordered rounded shadowed"
              name="form"
              onSubmit={e => this.formSubmitted(e)}
            >
              <h3 className="Login-header Form-offset">{t`Sign in to Metabase`}</h3>

              {Settings.ssoEnabled() && (
                <div className="mx4 mb4 py3 border-bottom relative">
                  <SSOLoginButton provider="google" ref="ssoLoginButton" />
                  {/*<div className="g-signin2 ml1 relative z2" id="g-signin2"></div>*/}
                  <div
                    className="mx1 absolute text-centered left right"
                    style={{ bottom: -8 }}
                  >
                    <span className="text-bold px3 py2 text-medium bg-white">{t`OR`}</span>
                  </div>
                </div>
              )}

              <FormMessage
                formError={
                  loginError && loginError.data.message ? loginError : null
                }
              />

              <FormField
                key="username"
                fieldName="username"
                formError={loginError}
              >
                <FormLabel
                  title={
                    Settings.ldapEnabled()
                      ? t`Username or email address`
                      : t`Email address`
                  }
                  fieldName={"username"}
                  formError={loginError}
                />
                <input
                  className="Form-input Form-offset full py1"
                  name="username"
                  placeholder="youlooknicetoday@email.com"
                  type={
                    /*
                     * if a user has ldap enabled, use a text input to allow for
                     * ldap username && schemes. if not and they're using built
                     * in auth, set the input type to email so we get built in
                     * validation in modern browsers
                     * */
                    ldapEnabled ? "text" : "email"
                  }
                  onChange={e => this.onChange("username", e.target.value)}
                  autoFocus
                />
                <span className="Form-charm" />
              </FormField>

              <FormField
                key="password"
                fieldName="password"
                formError={loginError}
              >
                <FormLabel
                  title={t`Password`}
                  fieldName={"password"}
                  formError={loginError}
                />
                <input
                  className="Form-input Form-offset full py1"
                  name="password"
                  placeholder="Shh..."
                  type="password"
                  onChange={e => this.onChange("password", e.target.value)}
                />
                <span className="Form-charm" />
              </FormField>

              <div className="Form-field">
                <ul className="Form-offset">
                  <input name="remember" type="checkbox" defaultChecked />{" "}
                  <label className="inline-block">{t`Remember Me:`}</label>
                </ul>
              </div>

              <div className="Form-actions p2 Grid Grid--full md-Grid--1of2">
                <button
                  className={cx("Button Grid-cell", {
                    "Button--primary": this.state.valid,
                  })}
                  disabled={!this.state.valid}
                >
                  {t`Sign in`}
                </button>
                <Link
                  to={
                    "/auth/forgot_password" +
                    (Utils.validEmail(this.state.credentials.username)
                      ? "?email=" + this.state.credentials.username
                      : "")
                  }
                  className="Grid-cell py2 sm-py0 text-medium md-text-right text-centered flex-full link"
                  onClick={e => {
                    window.OSX ? window.OSX.resetPassword() : null;
                  }}
                >{t`I seem to have forgotten my password`}</Link>
              </div>
            </form>
          </div>
        </div>
        <AuthScene />
      </div>
    );
  }
}
