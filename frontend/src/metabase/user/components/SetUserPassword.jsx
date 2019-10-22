/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Form, { FormField, FormFooter } from "metabase/containers/Form";

import MetabaseSettings from "metabase/lib/settings";
import { capitalize } from "metabase/lib/formatting";

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

  handleSubmit = values => {
    return this.props.submitFn({
      user_id: this.props.user.id,
      ...values,
    });
  };

  render() {
    const passwordComplexity = capitalize(
      MetabaseSettings.passwordComplexityDescription(),
    );

    return (
      <Form onSubmit={this.handleSubmit}>
        <FormField
          name="old_password"
          type="password"
          title={t`Current password`}
          placeholder={t`Shhh...`}
          autoFocus
          validate={value => !value && `required`}
        />
        <FormField
          name="password"
          type="password"
          title={t`New password`}
          description={passwordComplexity}
          placeholder={t`Make sure its secure like the instructions above`}
          validate={value =>
            (!value && `required`) ||
            MetabaseSettings.passwordComplexityDescription(value)
          }
        />
        <FormField
          name="password_confirm"
          type="password"
          title={t`Confirm new password`}
          placeholder={t`Make sure it matches the one you just entered`}
          validate={(value, { values: { password } }) =>
            (!value && `required`) ||
            (value !== password && t`must match password`)
          }
        />
        <FormFooter submitText={t`Save`} />
      </Form>
    );
  }
}
