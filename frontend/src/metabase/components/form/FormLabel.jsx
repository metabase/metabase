import React, { Component } from "react";
import PropTypes from "prop-types";

export default class FormLabel extends Component {
  static propTypes = {
    fieldName: PropTypes.string.isRequired,
    formError: PropTypes.object,
    message: PropTypes.string,
  };

  render() {
    let { fieldName, formError, message, title } = this.props;

    if (!message) {
      message =
        formError && formError.data.errors && fieldName in formError.data.errors
          ? formError.data.errors[fieldName]
          : undefined;
    }

    return (
      <label className="Form-label">
        {title} {message !== undefined ? <span>: {message}</span> : null}
      </label>
    );
  }
}
