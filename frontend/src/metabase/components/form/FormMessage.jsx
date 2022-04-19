/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";

import { FormMessageStyled } from "./FormMessage.styled";

export const SERVER_ERROR_MESSAGE = t`Server error encountered`;
export const UNKNOWN_ERROR_MESSAGE = t`Unknown error encountered`;

export default class FormMessage extends Component {
  render() {
    const { className, message, formSuccess, noPadding } = this.props;

    const treatedMessage = getMessage(this.props);

    return (
      <FormMessageStyled
        className={className}
        visible={!!message}
        noPadding={noPadding}
        hasSucceeded={formSuccess}
      >
        {treatedMessage}
      </FormMessageStyled>
    );
  }
}

const getMessage = ({ message, formError, formSuccess }) => {
  if (message) {
    return message;
  }

  if (formError) {
    return getErrorMessage(formError);
  }

  return getSuccessMessage(formSuccess);
};

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
