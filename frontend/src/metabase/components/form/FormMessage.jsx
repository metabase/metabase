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
        if (formError.data && formError.data.message) {
          message = formError.data.message;
        } else if (formError.status >= 400) {
          message = SERVER_ERROR_MESSAGE;
        } else {
          message = UNKNOWN_ERROR_MESSAGE;
        }
      } else if (formSuccess && formSuccess.data.message) {
        message = formSuccess.data.message;
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
