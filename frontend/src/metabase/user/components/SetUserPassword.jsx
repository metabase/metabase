/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "ttag";
import FormField from "metabase/components/form/FormField";
import FormLabel from "metabase/components/form/FormLabel";
import FormMessage from "metabase/components/form/FormMessage";

import MetabaseUtils from "metabase/lib/utils";
import MetabaseSettings from "metabase/lib/settings";

import _ from "underscore";
import cx from "classnames";

export default class SetUserPassword extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = { formError: null, valid: false };
  }

  static propTypes = {
    submitFn: PropTypes.func.isRequired,
    user: PropTypes.object,
    updatePasswordResult: PropTypes.object.isRequired,
  };

  componentDidMount() {
    this.validateForm();
  }

  validateForm() {
    const { valid } = this.state;
    let isValid = true;

    // required: first_name, last_name, email
    for (const fieldName in this.refs) {
      const node = ReactDOM.findDOMNode(this.refs[fieldName]);
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

    const formErrors = { data: { errors: {} } };

    // make sure new passwords match
    if (
      ReactDOM.findDOMNode(this.refs.password).value !==
      ReactDOM.findDOMNode(this.refs.password2).value
    ) {
      formErrors.data.errors.password2 = t`Passwords do not match`;
    }

    if (_.keys(formErrors.data.errors).length > 0) {
      this.setState({
        formError: formErrors,
      });
      return;
    }

    const details = {};

    details.user_id = this.props.user.id;
    details.old_password = ReactDOM.findDOMNode(this.refs.oldPassword).value;
    details.password = ReactDOM.findDOMNode(this.refs.password).value;

    this.props.submitFn(details);
  }

  render() {
    const { updatePasswordResult } = this.props;
    let { formError, valid } = this.state;
    const passwordComplexity = MetabaseSettings.passwordComplexityDescription(
      true,
    );

    formError =
      updatePasswordResult && !formError ? updatePasswordResult : formError;

    return (
      <div>
        <form
          className="NewForm"
          onSubmit={this.formSubmitted.bind(this)}
          noValidate
        >
          <FormField fieldName="old_password" formError={formError}>
            <FormLabel
              title={t`Current password`}
              fieldName="old_password"
              formError={formError}
              offset={false}
            />
            <input
              ref="oldPassword"
              type="password"
              className="Form-input full"
              name="old_password"
              placeholder={t`Shhh...`}
              onChange={this.onChange.bind(this)}
              autoFocus={true}
              required
            />
          </FormField>

          <FormField fieldName="password" formError={formError}>
            <FormLabel
              title={t`New password`}
              fieldName="password"
              formError={formError}
              offset={false}
            />
            <span className="block mb1">{passwordComplexity}</span>
            <input
              ref="password"
              type="password"
              className="Form-input full"
              name="password"
              placeholder={t`Make sure its secure like the instructions above`}
              onChange={this.onChange.bind(this)}
              required
            />
          </FormField>

          <FormField fieldName="password2" formError={formError}>
            <FormLabel
              title={t`Confirm new password`}
              fieldName="password2"
              formError={formError}
              offset={false}
            />
            <input
              ref="password2"
              type="password"
              className="Form-input full"
              name="password"
              placeholder={t`Make sure it matches the one you just entered`}
              required
              onChange={this.onChange.bind(this)}
            />
          </FormField>

          <div className="flex">
            <FormMessage
              formError={
                updatePasswordResult &&
                !updatePasswordResult.success &&
                !formError
                  ? updatePasswordResult
                  : undefined
              }
              formSuccess={
                updatePasswordResult && updatePasswordResult.success
                  ? updatePasswordResult
                  : undefined
              }
            />
            <button
              className={cx("Button ml-auto", { "Button--primary": valid })}
              disabled={!valid}
            >
              {t`Save`}
            </button>
          </div>
        </form>
      </div>
    );
  }
}
