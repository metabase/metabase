import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";

import cx from "classnames";
import { t, jt } from "c-3po";
import AuthScene from "../components/AuthScene.jsx";
import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";
import FormMessage from "metabase/components/form/FormMessage.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";
import Icon from "metabase/components/Icon.jsx";

import MetabaseSettings from "metabase/lib/settings";

import * as authActions from "../auth";

import { SessionApi } from "metabase/services";

const mapStateToProps = (state, props) => {
  return {
    token: props.params.token,
    resetError: state.auth && state.auth.resetError,
    resetSuccess: state.auth && state.auth.resetSuccess,
    newUserJoining: props.location.hash === "#new",
  };
};

const mapDispatchToProps = {
  ...authActions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class PasswordResetApp extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      credentials: {},
      valid: false,
      tokenValid: false,
    };
  }

  validateForm() {
    let { credentials } = this.state;

    let valid = true;

    if (!credentials.password || !credentials.password2) {
      valid = false;
    }

    if (this.state.valid !== valid) {
      this.setState({ valid });
    }
  }

  async componentWillMount() {
    try {
      let result = await SessionApi.password_reset_token_valid({
        token: this.props.token,
      });
      if (result && result.valid) {
        this.setState({ tokenValid: true });
      }
    } catch (error) {
      console.log("error validating token", error);
    }
  }

  componentDidMount() {
    this.validateForm();
  }

  componentDidUpdate() {
    this.validateForm();
  }

  onChange(fieldName, fieldValue) {
    this.setState({
      credentials: { ...this.state.credentials, [fieldName]: fieldValue },
    });
  }

  formSubmitted(e) {
    e.preventDefault();

    let { token, passwordReset } = this.props;
    let { credentials } = this.state;

    passwordReset(token, credentials);
  }

  render() {
    const { resetError, resetSuccess, newUserJoining } = this.props;
    const passwordComplexity = MetabaseSettings.passwordComplexityDescription(
      false,
    );

    const requestLink = (
      <Link to="/auth/forgot_password" className="link">
        {t`request a new reset email`}
      </Link>
    );

    if (!this.state.tokenValid) {
      return (
        <div className="full-height">
          <div className="full-height bg-white flex flex-column flex-full md-layout-centered">
            <div className="wrapper">
              <div className="Login-wrapper Grid  Grid--full md-Grid--1of2">
                <div className="Grid-cell flex layout-centered text-brand">
                  <LogoIcon
                    className="Logo my4 sm-my0"
                    width={66}
                    height={85}
                  />
                </div>
                <div className="Grid-cell bordered rounded shadowed">
                  <h3 className="Login-header Form-offset mt4">{t`Whoops, that's an expired link`}</h3>
                  <p className="Form-offset mb4 mr4">
                    {jt`For security reasons, password reset links expire after a little while. If you still need
                                        to reset your password, you can ${requestLink}.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <AuthScene />
        </div>
      );
    } else {
      return (
        <div className="full-height bg-white flex flex-column flex-full md-layout-centered">
          <div className="Login-wrapper wrapper Grid  Grid--full md-Grid--1of2">
            <div className="Grid-cell flex layout-centered text-brand">
              <LogoIcon className="Logo my4 sm-my0" width={66} height={85} />
            </div>
            {!resetSuccess ? (
              <div className="Grid-cell">
                <form
                  className="ForgotForm Login-wrapper bg-white Form-new bordered rounded shadowed"
                  name="form"
                  onSubmit={e => this.formSubmitted(e)}
                  noValidate
                >
                  <h3 className="Login-header Form-offset">{t`New password`}</h3>

                  <p className="Form-offset text-medium mb4">{t`To keep your data secure, passwords ${passwordComplexity}`}</p>

                  <FormMessage
                    formError={
                      resetError && resetError.data.message ? resetError : null
                    }
                  />

                  <FormField
                    key="password"
                    fieldName="password"
                    formError={resetError}
                  >
                    <FormLabel
                      title={t`Create a new password`}
                      fieldName={"password"}
                      formError={resetError}
                    />
                    <input
                      className="Form-input Form-offset full"
                      name="password"
                      placeholder={t`Make sure its secure like the instructions above`}
                      type="password"
                      onChange={e => this.onChange("password", e.target.value)}
                      autoFocus
                    />
                    <span className="Form-charm" />
                  </FormField>

                  <FormField
                    key="password2"
                    fieldName="password2"
                    formError={resetError}
                  >
                    <FormLabel
                      title={t`Confirm new password`}
                      fieldName={"password2"}
                      formError={resetError}
                    />
                    <input
                      className="Form-input Form-offset full"
                      name="password2"
                      placeholder={t`Make sure it matches the one you just entered`}
                      type="password"
                      onChange={e => this.onChange("password2", e.target.value)}
                    />
                    <span className="Form-charm" />
                  </FormField>

                  <div className="Form-actions">
                    <button
                      className={cx("Button", {
                        "Button--primary": this.state.valid,
                      })}
                      disabled={!this.state.valid}
                    >
                      Save new password
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="Grid-cell">
                <div className="SuccessGroup bg-white bordered rounded shadowed">
                  <div className="SuccessMark">
                    <Icon name="check" />
                  </div>
                  <p>{t`Your password has been reset.`}</p>
                  <p>
                    {newUserJoining ? (
                      <Link
                        to="/?new"
                        className="Button Button--primary"
                      >{t`Sign in with your new password`}</Link>
                    ) : (
                      <Link
                        to="/"
                        className="Button Button--primary"
                      >{t`Sign in with your new password`}</Link>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
          <AuthScene />
        </div>
      );
    }
  }
}
