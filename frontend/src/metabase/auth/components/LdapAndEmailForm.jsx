import React, { Component } from "react";
import { Link } from "react-router";
import { connect } from "react-redux";
import { t } from "ttag";

import Settings from "metabase/lib/settings";
import Utils from "metabase/lib/utils";
import Button from "metabase/components/Button";
import CheckBox from "metabase/components/CheckBox";
import FormField from "metabase/components/form/FormField";
import FormLabel from "metabase/components/form/FormLabel";
import FormMessage from "metabase/components/form/FormMessage";

import { login } from "../auth";
import { getLoginError } from "../selectors";

const mapStateToProps = state => ({ loginError: getLoginError(state) });
const mapDispatchToProps = { login };

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class LdapAndEmailForm extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      credentials: {},
      valid: false,
      rememberMe: true,
    };
  }

  validateForm() {
    const { credentials } = this.state;

    let valid = true;

    if (!credentials.username || !credentials.password) {
      valid = false;
    }

    if (this.state.valid !== valid) {
      this.setState({ valid });
    }
  }

  componentDidUpdate() {
    this.validateForm();
  }
  componentDidMount() {
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

    const { login, location } = this.props;
    const { credentials } = this.state;

    login(credentials, location.query.redirect);
  }

  render() {
    const { loginError } = this.props;
    const ldapEnabled = Settings.ldapEnabled();

    return (
      <form name="form" onSubmit={e => this.formSubmitted(e)}>
        <FormMessage
          formError={loginError && loginError.data.message ? loginError : null}
        />
        <FormField key="username" fieldName="username" formError={loginError}>
          <FormLabel
            title={
              ldapEnabled ? t`Username or email address` : t`Email address`
            }
            fieldName={"username"}
            formError={loginError}
          />
          <input
            className="Form-input full"
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
        </FormField>

        <FormField key="password" fieldName="password" formError={loginError}>
          <FormLabel
            title={t`Password`}
            fieldName={"password"}
            formError={loginError}
          />
          <input
            className="Form-input full"
            name="password"
            placeholder="Shh..."
            type="password"
            onChange={e => this.onChange("password", e.target.value)}
          />
        </FormField>

        <div className="Form-field">
          <div className="flex align-center">
            <CheckBox
              name="remember"
              checked={this.state.rememberMe}
              onChange={() =>
                this.setState({ rememberMe: !this.state.rememberMe })
              }
            />
            <span className="ml1">{t`Remember Me`}</span>
          </div>
        </div>

        <div className="Form-actions flex align-center">
          <Button primary={this.state.valid} disabled={!this.state.valid}>
            {t`Sign in`}
          </Button>
          <Link
            to={
              "/auth/forgot_password" +
              (Utils.validEmail(this.state.credentials.username)
                ? "?email=" + this.state.credentials.username
                : "")
            }
            className="text-right ml-auto link"
            onClick={e => {
              window.OSX ? window.OSX.resetPassword() : null;
            }}
          >{t`I seem to have forgotten my password`}</Link>
        </div>
      </form>
    );
  }
}
