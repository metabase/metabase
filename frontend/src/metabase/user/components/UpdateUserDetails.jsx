/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "c-3po";
import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";
import FormMessage from "metabase/components/form/FormMessage.jsx";

import MetabaseUtils from "metabase/lib/utils";

import _ from "underscore";
import cx from "classnames";

export default class UpdateUserDetails extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = { formError: null, valid: false };
  }

  static propTypes = {
    submitFn: PropTypes.func.isRequired,
    user: PropTypes.object,
    updateUserResult: PropTypes.object.isRequired,
  };

  componentDidMount() {
    this.validateForm();
  }

  validateForm() {
    let { valid } = this.state;
    let isValid = true;

    // required: first_name, last_name, email
    for (let fieldName in this.refs) {
      let node = ReactDOM.findDOMNode(this.refs[fieldName]);
      if (node.required && MetabaseUtils.isEmpty(node.value)) {
        isValid = false;
      }
    }

    if (isValid !== valid) {
      this.setState({
        valid: isValid,
      });
    }
  }

  onChange() {
    this.validateForm();
  }

  formSubmitted(e) {
    e.preventDefault();

    this.setState({
      formError: null,
    });

    let formErrors = { data: { errors: {} } };

    // validate email address
    if (
      !MetabaseUtils.validEmail(ReactDOM.findDOMNode(this.refs.email).value)
    ) {
      formErrors.data.errors.email = t`Not a valid formatted email address`;
    }

    if (_.keys(formErrors.data.errors).length > 0) {
      this.setState({
        formError: formErrors,
      });
      return;
    }

    let user = this.props.user ? _.clone(this.props.user) : {};

    user.first_name = ReactDOM.findDOMNode(this.refs.firstName).value;
    user.last_name = ReactDOM.findDOMNode(this.refs.lastName).value;
    user.email = ReactDOM.findDOMNode(this.refs.email).value;

    this.props.submitFn(user);
  }

  render() {
    const { updateUserResult, user } = this.props;
    const { formError, valid } = this.state;
    const managed = user.google_auth || user.ldap_auth;

    return (
      <div>
        <form
          className="Form-new bordered rounded shadowed"
          onSubmit={this.formSubmitted.bind(this)}
          noValidate
        >
          <FormField fieldName="first_name" formError={formError}>
            <FormLabel
              title={t`First name`}
              fieldName="first_name"
              formError={formError}
            />
            <input
              ref="firstName"
              className="Form-input Form-offset full"
              name="name"
              defaultValue={user ? user.first_name : null}
              placeholder="Johnny"
              onChange={this.onChange.bind(this)}
            />
            <span className="Form-charm" />
          </FormField>

          <FormField fieldName="last_name" formError={formError}>
            <FormLabel
              title={t`Last name`}
              fieldName="last_name"
              formError={formError}
            />
            <input
              ref="lastName"
              className="Form-input Form-offset full"
              name="name"
              defaultValue={user ? user.last_name : null}
              placeholder="Appleseed"
              required
              onChange={this.onChange.bind(this)}
            />
            <span className="Form-charm" />
          </FormField>

          <FormField fieldName="email" formError={formError}>
            <FormLabel
              title={
                user.google_auth
                  ? t`Sign in with Google Email address`
                  : t`Email address`
              }
              fieldName="email"
              formError={formError}
            />
            <input
              ref="email"
              className={cx("Form-offset full", {
                "Form-input": !managed,
                "text-light h1 borderless mt1": managed,
              })}
              name="email"
              defaultValue={user ? user.email : null}
              placeholder="youlooknicetoday@email.com"
              required
              onChange={this.onChange.bind(this)}
              disabled={managed}
            />
            {!managed && <span className="Form-charm" />}
          </FormField>

          <div className="Form-actions">
            <button
              className={cx("Button", { "Button--primary": valid })}
              disabled={!valid}
            >
              {t`Save`}
            </button>
            <FormMessage
              formError={
                updateUserResult && !updateUserResult.success
                  ? updateUserResult
                  : undefined
              }
              formSuccess={
                updateUserResult && updateUserResult.success
                  ? updateUserResult
                  : undefined
              }
            />
          </div>
        </form>
      </div>
    );
  }
}
