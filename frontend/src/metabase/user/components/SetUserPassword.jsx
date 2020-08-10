/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import User from "metabase/entities/users";

export default class SetUserPassword extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = { formError: null, valid: false };
  }

  static propTypes = {
    submitFn: PropTypes.func.isRequired,
    user: PropTypes.object,
  };

  handleSubmit = values => {
    return this.props.submitFn({
      user_id: this.props.user.id,
      ...values,
    });
  };

  render() {
    return (
      <User.Form
        form={User.forms.password}
        submitTitle={t`Save`}
        onSubmit={this.handleSubmit}
      />
    );
  }
}
