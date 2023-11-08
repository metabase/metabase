/* eslint-disable react/prop-types */
import React, { Component } from "react";
import cx from "classnames";
import { t } from "ttag";
export const SERVER_ERROR_MESSAGE = t`Server error encountered`;
export const UNKNOWN_ERROR_MESSAGE = t`Unknown error encountered`;

export default class FormMessage extends Component {
  render() {
    let { className, formError, formSuccess, message } = this.props;

    if (!message) {
      if (formError) {
        message = getErrorMessage(formError);
      } else if (formSuccess) {
        message = getSuccessMessage(formSuccess);
      }
    }

    const classes = cx("Form-message", "px2", className, {
      "Form-message--visible": !!message,
      "text-success": formSuccess,
      "text-error": formError,
    });

    return <span className={classes}>{message}</span>;
  }
}

export const getErrorMessage = formError => {
  if (formError) {
    if (formError.data && formError.data.message) {
      return formError.data.message;
    } else if (formError.status >= 400) {
      return SERVER_ERROR_MESSAGE;
    } else {
      return UNKNOWN_ERROR_MESSAGE;
    }
  }
};

export const getSuccessMessage = formSuccess => {
  if (formSuccess && formSuccess.data.message) {
    return formSuccess.data.message;
  }
};
